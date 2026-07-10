const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.packager.config.asar !== false) {
    return;
  }

  const sourcePackage = path.join(context.packager.projectDir, "desktop", "package.json");
  const targetPackage = path.join(context.appOutDir, "resources", "app", "package.json");
  const sourceServerDir = path.join(context.packager.projectDir, "server");
  const targetServerDir = path.join(context.appOutDir, "resources", "app", "server");

  fs.mkdirSync(path.dirname(targetPackage), { recursive: true });
  fs.copyFileSync(sourcePackage, targetPackage);

  fs.rmSync(targetServerDir, { recursive: true, force: true });
  fs.cpSync(sourceServerDir, targetServerDir, { recursive: true });
};
