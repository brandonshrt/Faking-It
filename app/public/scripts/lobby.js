const socket = io();

// Get game code from URL or localStorage
const urlParams = new URLSearchParams(window.location.search);
const gameCode = urlParams.get("code") || localStorage.getItem("gameCode");
const playerName = localStorage.getItem("playerName");
const playerAvatar = localStorage.getItem("playerAvatar");

// UI elements
const playerGrid = document.getElementById("playerGrid");
const lobbyTitle = document.getElementById("lobbyTitle");
const startGameBtn = document.getElementById("startGameBtn");

window.addEventListener("load", () => {
    // Request the current lobby state when the page loads
    if (gameCode) {
        socket.emit("joinLobby", { code: gameCode });
    } else {
        alert("Missing game code!");
    }
});

// Listen for the initial player list when joining lobby
socket.on("playerListUpdate", (players) => {
    displayLobby(players);
});

// Listen for the initial player list when joining lobby
socket.on("lobbyState", (players) => {
    displayLobby(players);
});

// Build the lobby display
function displayLobby(players) {
  const total = players.length;
  lobbyTitle.textContent = `Lobby (${total}/6)`;

  playerGrid.innerHTML = ""; // clear grid

  for (let i = 0; i < 6; i++) {
    const card = document.createElement("div");
    card.classList.add("player-card");

    const player = players[i];
    if (player) {
      const avatarImg = document.createElement("img");
      avatarImg.src = `../assets/icons/${player.avatar}.png`;
      avatarImg.alt = player.name;
      avatarImg.classList.add("avatar-img");

      const name = document.createElement("p");
      name.textContent = player.name;
      name.classList.add("player-name");

      card.appendChild(avatarImg);
      card.appendChild(name);
    } else {
      card.classList.add("empty-card");
    }

    playerGrid.appendChild(card);
  }
}

// Start game button (you can expand later)
startGameBtn.addEventListener("click", () => {
  socket.emit("startGame", { code: gameCode });
  alert("Game starting soon!");
});

// Handle server errors
socket.on("errorMessage", (msg) => alert(msg));
