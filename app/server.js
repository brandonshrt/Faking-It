// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Connection logic
io.on("connection", (socket) => {
  console.dir(games, { depth: null });
  
  // Create game logic
  socket.on("createGame", () => {
    // Generate a game code with letters and numbers and add that code to the games object
    const code = Math.random().toString(36).substring(2, 9).toUpperCase();

    games[code] = { players: [], started: false, host: null };

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
    game.players.push({ socketId: socket.id, ...player });
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
    console.log(player, code);
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

});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
