// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------- Config / constants -------
const ANSWER_TIME_MS = 30_000; // time players have to answer
const DELIB_TIME_MS = 30_000; // time players deliberate / vote
const POST_RESULTS_MS = 5_000; // pause after results before next question
const QUESTIONS_PER_ROUND = 3;

// ------- Utility helpers -------
const randIndex = (arr) => Math.floor(Math.random() * arr.length);
const waitMs = (ms) => new Promise((res) => setTimeout(res, ms));
const makeGameCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// Load questions
const questionsPath = path.join(__dirname, '../app/data/questions.json');
const questionsData = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));

// Instantiate express and create the Socket IO server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Default route: redirect to pages/index.html
app.use(express.static("public"));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/pages/index.html"));
});

// Games storage
const games = {};

async function runGameLoop(code) {
  const game = games[code];
  if (!game) return;
  game.started = true;

  game.currentRound = 1;
  game.currentQuestionIndex = 0;

  const ROUNDS = [
    questionsData.round1,
    questionsData.round2,
    questionsData.round3
  ];

  for (let r = 0; r < ROUNDS.length; r++) {
    game.currentRound = r + 1;

    for (let q = 0; q < 3; q++) {
      game.currentQuestionIndex = q + 1;

      await runSingleQuestion(code, ROUNDS[r]);
    }
  }

  finishGame(code);
}

async function runSingleQuestion(code, questionSet) {
  const game = games[code];
  if (!game) return;

  // Create an isolated context for THIS question
  const ctx = {
    answers: {},
    votes: {},
    answerResolve: null,
    voteResolve: null,
    answerTimer: null,
    voteTimer: null
  };

  game.roundContext = ctx;
  game.answerDeadline = null;
  game.votingTimer = null;

  // Pick question pair
  const questionPair = questionSet[randIndex(questionSet)];
  game.currentQuestion = questionPair;

  // Pick faker
  const faker = game.players[randIndex(game.players)];
  game.fakerId = faker.id;

  // Send questions
  game.players.forEach(p => {
    const sock = io.sockets.sockets.get(p.socketId);
    if (sock) {
      sock.emit("roundQuestion", {
        round: game.currentRound,
        questionNumber: game.currentQuestionIndex,
        question: p.id === game.fakerId ? questionPair[1] : questionPair[0],
        timeMs: ANSWER_TIME_MS
      });
    }
  });

  // Wait for answers
  await waitForAnswers(code, ANSWER_TIME_MS);

  revealAnswers(code);

  // Wait for votes
  await waitForVotes(code, DELIB_TIME_MS);

  showResults(code);

  await waitMs(POST_RESULTS_MS);
}


// Wait for answers OR timeout
function waitForAnswers(code, timeout) {
  const ctx = games[code].roundContext;

  return new Promise(res => {
    ctx.answerResolve = res;
    ctx.answerTimer = setTimeout(res, timeout);
    games[code].answerDeadline = ctx.answerTimer;
  });
}

function waitForVotes(code, timeout) {
  const ctx = games[code].roundContext;

  return new Promise(res => {
    ctx.voteResolve = res;
    ctx.voteTimer = setTimeout(res, timeout);
  });
}



// When all questions finish
function finishGame(code) {
  const game = games[code];
  if (!game) return;

  // Determine winner
  const winner = game.players.reduce((a, b) => a.points > b.points ? a : b);

  // Send to all clients
  io.to(code).emit("gameOver", {
    players: game.players,
    winner: winner
  });
}

// Helper function to reveal answers
function revealAnswers(code) {
  const game = games[code];
  if (!game) return;

  const ctx = game.roundContext;

  // Build answers array with player info
  const answersArray = game.players.map(player => ({
    id: player.id,
    name: player.name,
    answer: ctx.answers[player.id] || null
  }));

  // Calculate majority answer (most common non-null answer)
  const answerCounts = {};
  answersArray.forEach(a => {
    if (a.answer) {
      answerCounts[a.answer] = (answerCounts[a.answer] || 0) + 1;
    }
  });

  let majority = null;
  let maxCount = 0;
  for (const [answer, count] of Object.entries(answerCounts)) {
    if (count > maxCount) {
      maxCount = count;
      majority = answer;
    }
  }

  console.log(`Game ${code}: Revealing answers. Majority: "${majority}"`);

  // Send answers to all players
  io.to(code).emit("revealAnswers", {
    answers: answersArray,
    majority: game.currentQuestion[0],
    deliberationTimeMs: 30000
  });

  // Reset votes for new voting round
  game.votes = {};

  // Start voting timer (30 seconds)
  if (game.votingTimer) clearTimeout(game.votingTimer);
  game.votingTimer = setTimeout(() => {
    console.log(`Game ${code}: Voting time expired!`);
    showResults(code);
  }, 30000);
}

// Helper function to show voting results
function showResults(code) {
  const game = games[code];
  if (!game) return;

  if (game.roundContext.completed) return;  // prevent double-run
  game.roundContext.completed = true;

  // Count votes
  const ctx = game.roundContext;
  const voteCounts = {};
  for (const voterId in ctx.votes) {
    const votedForId = ctx.votes[voterId];
    voteCounts[votedForId] = (voteCounts[votedForId] || 0) + 1;
  }

  // Find who got most votes
  let topId = null;
  let maxVotes = 0;
  for (const [playerId, count] of Object.entries(voteCounts)) {
    if (count > maxVotes) {
      maxVotes = count;
      topId = playerId;
    }
  }

  console.log(`Game ${code}: Most voted: ${topId}, Faker was: ${game.fakerId}`);

  // Find player names
  const topPlayer = game.players.find(p => p.id === topId);
  const fakerPlayer = game.players.find(p => p.id === game.fakerId);

  if (topId === game.fakerId) {
      // faker caught
      game.players.forEach(p => {
          if (ctx.votes[p.id] === topId) {
              p.points += 1;
          }
      });
  } else {
      // faker survives
      fakerPlayer.points += 2;
  }

  // Send results to all players
  io.to(code).emit("voteResults", {
    voteCounts: voteCounts,
    topId: topId,
    topName: topPlayer ? topPlayer.name : "nobody",
    fakerId: game.fakerId,
    fakerName: fakerPlayer ? fakerPlayer.name : "unknown",
    players: game.players
  });
}

// Connection logic
io.on("connection", (socket) => {
  console.dir(games, { depth: null });

  // Create game logic
  socket.on("createGame", () => {
    // Generate a game code with letters and numbers and add that code to the games object
    const code = makeGameCode();

    // Add game to games log
    games[code] = {
      players: [],
      started: false,
      host: null,
      currentQuestion: null,
      fakerId: null,
      answers: {},
      votes: {}
    };

    // Join the game and emit that the game (with the code) has been created
    socket.join(code)
    socket.emit("gameCreated", { code });
  });

  // Join game logic
  socket.on("joinGame", ({ code, player }) => {
    // Check if that code is an active game
    const game = games[code];
    if (!game) {
      return socket.emit("errorMessage", "Game not found.");
    }

    // Check if the game has been started
    if (game.started) {
      return socket.emit("errorMessage", "Game has already started.");
    }

    // Create game host if there is no host
    if (game.host === null){
      game.host = player.id;
      io.to(code).emit("hostAssigned", game.host);
    }

    // Add player to game
    game.players.push({
      socketId: socket.id,
      ...player, 
      points: 0 
    });

    // Join game
    socket.join(code);

    // Emit that the play was added to the player list
    io.to(code).emit("playerListUpdate", game.players);
  });

  socket.on("checkGameCode", (code) => {
    const game = games[code];

    if (game && !game.started) {
      socket.emit("gameCodeValid", code);
    }
    else socket.emit("errorMessage", "Invalid or already started game.");
  });

  // Display lobby logic
  socket.on("joinLobby", ({ code }) => {
    const game = games[code];

    // Check if game has either already started, the lobby is not found, or lobby is full
    if (!game) return socket.emit("errorMessage", "Lobby not found.");
    if (game.started) return socket.emit("errorMessage", "Game already started.")
    // if (game.players.length >= 6) return socket.emit("errorMessage", "Lobby is full.")

    // Join the socket to the room so it gets future updates too
    socket.join(code);

    // Send the current player list only to this client
    socket.emit("lobbyState", game.players);
  });

  // Disconnection logic
  socket.on("disconnect", () => {
    for (const code in games) {
      const game = games[code];

      if (!game){
        continue;
      }

      game.players = game.players.filter(p => p.id !== socket.id);
      io.to(code).emit("playerListUpdate", game.players);
    }
  });

  socket.on("isGameHost", ({ player, code }) => {
    //console.log(player, code);
    const game = games[code];
    if (!game) {
      return socket.emit("errorMessage", "Game not found.");
    }

    if (game.host === player) {
      socket.emit("isHost");
    } else {
      socket.emit("notHost");
    }
  });

  // When a player loads game.html, they join the game room
  socket.on("joinGameRoom", ({ code, playerId }) => {
    const game = games[code];
    if (!game) return socket.emit("errorMessage", "Game not found.");

    socket.join(code);

    // Update the player's socketId (in case they reconnected)
    const player = game.players.find(p => p.id === playerId);
    if (player) {
      player.socketId = socket.id;
      console.log(`Player ${player.name} joined game room ${code}`);
    }

    // Send current players list
    socket.emit("updatePlayers", game.players);

    // If game already started and question is active, send it to this player
    if (game.started && game.currentQuestion) {
      const question = playerId === game.fakerId ? game.currentQuestion[1] : game.currentQuestion[0];
      socket.emit("roundQuestion", {
        round: 1,
        question: question,
        timeMs: 30000
      });
    }
  });

  socket.on("startGame", async ({ code, playerId }) => {
    const game = games[code];
    if (!game) return socket.emit("errorMessage", "Game not found.");
    if (game.host !== playerId) return socket.emit("errorMessage", "Only the host can start the game!");

    game.started = true;

    io.to(code).emit("gameStarted", { code });
    runGameLoop(code);
  });
  
  
  socket.on("chatMessage", ({ code, name, text }) => {
    const game = games[code];
    if (!game) return;

    io.to(code).emit("chatMessage", { name, text });
  });

  // Collect player answers
  socket.on("submitAnswer", ({ code, playerId, answer }) => {
    const game = games[code];
    const ctx = game.roundContext;
    if (!ctx) return;
  
    ctx.answers[playerId] = answer;
    game.answers[playerId] = answer;
  
    if (Object.keys(ctx.answers).length === game.players.length) {
      clearTimeout(ctx.answerTimer);
      ctx.answerResolve();
    }
  });
  

  // Collect votes
  socket.on("submitVote", ({ code, voterId, votedForId }) => {
    const game = games[code];
    const ctx = game.roundContext;
    if (!ctx) return;
  
    ctx.votes[voterId] = votedForId;
  
    if (Object.keys(ctx.votes).length === game.players.length) {
      clearTimeout(ctx.voteTimer);
      clearTimeout(game.votingTimer);
      ctx.voteResolve();
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
