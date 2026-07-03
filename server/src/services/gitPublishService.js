import simpleGit from "simple-git";

function normalizeCommitTitle(title) {
  return String(title || "untitled")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCommitMessage(task) {
  const category = task.categoryName || "misc";
  const title = normalizeCommitTitle(task.articleTitle || task.title);
  return `docs(${category}): publish ${title}`;
}

function collectAssetFiles(status) {
  const candidates = new Set([
    ...status.not_added,
    ...status.created,
    ...status.modified,
  ]);

  return Array.from(candidates).filter((file) => file.replaceAll("\\", "/").startsWith("assets/"));
}

export async function publishArticleToGit({ repository, task }) {
  if (!task.articlePath) {
    throw new Error("Task has no articlePath, cannot publish to git.");
  }

  const git = simpleGit(repository.path);
  const relativeArticlePath = task.articlePath.replaceAll("\\", "/");
  const filesToCommit = [relativeArticlePath];

  await git.add(relativeArticlePath);

  // 文章配图等新增资源一并提交，避免只提交单个 md 导致图片缺失
  const status = await git.status();
  const assetFiles = collectAssetFiles(status);
  if (assetFiles.length > 0) {
    await git.add(assetFiles);
    filesToCommit.push(...assetFiles);
  }

  let commitResult = null;
  try {
    commitResult = await git.commit(buildCommitMessage(task), filesToCommit);
  } catch (error) {
    const message = String(error?.message || "");
    if (!message.includes("nothing to commit")) {
      throw error;
    }
  }

  let pushResult = null;
  if (repository.autoPush) {
    pushResult = await git.push("origin", repository.branch);
  }

  return {
    committed: Boolean(commitResult),
    pushed: Boolean(pushResult),
    branch: repository.branch,
    files: filesToCommit,
    commitSummary: commitResult?.summary || null,
    pushSummary: pushResult?.pushed || null,
  };
}
