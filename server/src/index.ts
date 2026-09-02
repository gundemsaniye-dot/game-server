import { App } from "uWebSockets.js";
import { GameLoop } from "./game/GameLoop";
import { Matchmaking } from "./game/Matchmaking";
import { ConnectionManager } from "./network/ConnectionManager";
import { Logger } from "./utils/Logger";
import { deploymentHealth } from "./network/DeploymentHealth";

const PORT = Number(process.env.PORT) || 3001;

// Initialize core systems
const gameLoop = new GameLoop(20); // 20 Hz authoritative tick
const matchmaking = new Matchmaking(gameLoop);
const connectionManager = new ConnectionManager(matchmaking, gameLoop);

// Setup uWS app
const app = App();
app.get('/health', (res) => {
  res.writeHeader('Content-Type', 'application/json')
    .writeHeader('Cache-Control', 'no-store')
    .end(JSON.stringify(deploymentHealth(process.env.RENDER_GIT_COMMIT)));
});
connectionManager.setup(app);

// Start game loop
gameLoop.start();

// Start listening
app.listen("0.0.0.0", PORT, (token) => {
  if (token) {
    Logger.info(`Server is running and listening on port ${PORT}`);
  } else {
    Logger.error(`Failed to listen on port ${PORT}`);
  }
});
