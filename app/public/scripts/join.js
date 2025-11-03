// public/join.js
const socket = io();

function joinGame() {
  const code = document.getElementById("gameCodeInput").value.trim().toUpperCase();
  const message = document.getElementById("joinMessage");

  if (!code) {
    message.textContent = "Please enter a game code.";
    return;
  }

  // Ask the server if this game exists
  socket.emit("checkGameCode", code);

  socket.once("gameCodeValid", () => {
    // Redirect to setup page with the valid code
    window.location.href = `/pages/setup.html?code=${code}`;
  });

  socket.once("errorMessage", (msg) => {
    message.textContent = msg;
  });
}
