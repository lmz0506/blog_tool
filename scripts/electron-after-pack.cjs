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

  // 版本号统一取构建元数据（extraMetadata 已合并根 package.json 的版本），
  // 避免 desktop/package.json 版本滞后导致安装后 app.getVersion() 与发布版本不一致
  const packageJson = JSON.parse(fs.readFileSync(sourcePackage, "utf8"));
  packageJson.version = context.packager.appInfo.version;

  fs.mkdirSync(path.dirname(targetPackage), { recursive: true });
  fs.writeFileSync(targetPackage, `${JSON.stringify(packageJson, null, 2)}\n`);

  fs.rmSync(targetServerDir, { recursive: true, force: true });
  fs.cpSync(sourceServerDir, targetServerDir, { recursive: true });
};
