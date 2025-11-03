// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

//app.use(express.static(path.join(__dirname, "public")));
app.use(express.static("public"));


// Default route: redirect to pages/index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/pages/index.html"));
});

const games = {};

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("createGame", () => {
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    games[code] = { players: [], started: false };
    socket.join(code);
    socket.emit("gameCreated", { code });
  });

  socket.on("checkGameCode", (code) => {
    const game = games[code];
    if (game && !game.started) socket.emit("gameCodeValid", code);
    else socket.emit("errorMessage", "Invalid or already started game.");
  });

  socket.on("joinGame", ({ code, player }) => {
    const game = games[code];
    if (!game) return socket.emit("errorMessage", "Game not found.");
    game.players.push({ id: socket.id, ...player });
    socket.join(code);
    io.to(code).emit("playerListUpdate", game.players);
  });

  socket.on("disconnect", () => {
    for (const code in games) {
      const game = games[code];
      if (!game) continue;
      game.players = game.players.filter(p => p.id !== socket.id);
      io.to(code).emit("playerListUpdate", game.players);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
