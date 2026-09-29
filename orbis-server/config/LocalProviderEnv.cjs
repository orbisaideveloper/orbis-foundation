const os = require("node:os");
const path = require("node:path");
const dotenv = require("dotenv");

const LOCAL_PROVIDER_ENV_FILES = Object.freeze([
  "hf.env",
  "tavily.env",
]);

function loadLocalProviderEnv({
  homeDir = os.homedir(),
  dotenvConfig = dotenv.config,
} = {}) {
  const configDir = path.join(
    homeDir,
    ".config",
    "orbis",
  );

  for (const fileName of LOCAL_PROVIDER_ENV_FILES) {
    dotenvConfig({
      path: path.join(configDir, fileName),
      override: false,
      quiet: true,
    });
  }
}

module.exports = {
  LOCAL_PROVIDER_ENV_FILES,
  loadLocalProviderEnv,
};
