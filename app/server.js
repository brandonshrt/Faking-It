// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load questions
const questionsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../app/data/questions.json'), 'utf-8'));

// Instantiate express and create the Socket IO server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// Default route: redirect to pages/index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/pages/index.html"));
});

// Games storage
const games = {};

// Helper function to reveal answers
function revealAnswers(code) {
  const game = games[code];
  if (!game) return;

  // Build answers array with player info
  const answersArray = game.players.map(player => ({
    id: player.id,
    name: player.name,
    answer: game.answers[player.id] || null
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
    majority: majority,
    deliberationTimeMs: 30000
  });

  // Reset votes for new voting round
  game.votes = {};

  // Start voting timer (30 seconds)
  game.votingTimer = setTimeout(() => {
    console.log(`Game ${code}: Voting time expired!`);
    showResults(code);
  }, 30000);
}

// Helper function to show voting results
function showResults(code) {
  const game = games[code];
  if (!game) return;

  // Count votes
  const voteCounts = {};
  for (const voterId in game.votes) {
    const votedForId = game.votes[voterId];
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
    const code = Math.random().toString(36).substring(2, 9).toUpperCase();

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

    // Create game host
    if (game.host === null){
      game.host = player.id;
      io.to(code).emit("hostAssigned", game.host);
    }

    // Check if the game has been started
    if (game.started) {
      return socket.emit("errorMessage", "Game has already started.");
    }

    // Add player to game
    game.players.push({ socketId: socket.id, ...player, points: 0 });
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
    if (!game) return socket.emit("errorMessage", "Lobby not found.");

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

  socket.on("startGame", ({ code, playerId }) => {
    const game = games[code];
    if (!game) return socket.emit("errorMessage", "Game not found.");

    // Only the host can start
    if (game.host !== playerId) {
      return socket.emit("errorMessage", "Only the host can start the game!");
    }

    game.started = true;

    // Pick a random Round 1 question
    const round1Questions = questionsData.round1;
    const randomIndex = Math.floor(Math.random() * round1Questions.length);
    const questionPair = round1Questions[randomIndex]; // [realQ, fakerQ]

    game.currentQuestion = questionPair;

    // Pick a random player to be the faker
    const randomPlayerIndex = Math.floor(Math.random() * game.players.length);
    const faker = game.players[randomPlayerIndex];
    game.fakerId = faker.id;

    console.log(`Game ${code}: Faker is ${faker.name} (${faker.id})`);
    console.log(`Game ${code}: Real question: "${questionPair[0]}"`);
    console.log(`Game ${code}: Faker question: "${questionPair[1]}"`);

    // Reset answers
    game.answers = {};

    // Send different questions to each player
    game.players.forEach(player => {
      const playerSocket = io.sockets.sockets.get(player.socketId);
      if (playerSocket) {
        const isFaker = player.id === game.fakerId;
        const question = isFaker ? questionPair[1] : questionPair[0];

        console.log(`Game ${code}: Sending to ${player.name} (${player.id}): ${isFaker ? 'FAKER' : 'REAL'} question`);
        console.log(`  → "${question}"`);

        playerSocket.emit("roundQuestion", {
          round: 1,
          question: question,
          timeMs: 30000 // 30 seconds to answer
        });
      }
    });

    // Start answer timer (30 seconds)
    game.answerTimer = setTimeout(() => {
      console.log(`Game ${code}: Answer time expired!`);
      revealAnswers(code);
    }, 30000);

    // Also notify everyone the game started
    io.to(code).emit("gameStarted", { code });
  });

  // Collect player answers
  socket.on("submitAnswer", ({ code, playerId, answer }) => {
    const game = games[code];
    if (!game) return socket.emit("errorMessage", "Game not found.");

    // Store the answer
    game.answers[playerId] = answer;
    console.log(`Game ${code}: Player answered: "${answer}"`);

    // Check if everyone has answered
    const answeredCount = Object.keys(game.answers).length;
    console.log(`Game ${code}: ${answeredCount}/${game.players.length} players answered`);

    if (answeredCount === game.players.length) {
      // Everyone answered! Clear timer and reveal
      clearTimeout(game.answerTimer);
      console.log(`Game ${code}: All players answered, revealing now!`);
      revealAnswers(code);
    }
  });

  // Collect votes
  socket.on("submitVote", ({ code, voterId, votedForId }) => {
    const game = games[code];
    if (!game) return socket.emit("errorMessage", "Game not found.");

    // Store the vote
    game.votes[voterId] = votedForId;
    console.log(`Game ${code}: Player voted for ${votedForId}`);

    // Check if everyone has voted
    const votedCount = Object.keys(game.votes).length;
    console.log(`Game ${code}: ${votedCount}/${game.players.length} players voted`);

    if (votedCount === game.players.length) {
      // Everyone voted! Clear timer and show results
      clearTimeout(game.votingTimer);
      console.log(`Game ${code}: All players voted, showing results!`);
      showResults(code);
    }
  });

});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));