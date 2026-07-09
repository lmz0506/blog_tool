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

  // 只连带提交文章配图目录，避免把仓库里其他无关改动一并提交
  return Array.from(candidates).filter((file) =>
    file.replaceAll("\\", "/").startsWith("assets/images/"),
  );
}

export async function publishArticleToGit({ repository, task }) {
  if (!task.articlePath) {
    throw new Error("任务没有文章路径，无法发布到 git。");
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

  // push 失败不能掩盖 commit 已成功的事实，单独捕获并记录原因
  let pushResult = null;
  let pushError = null;
  if (repository.autoPush) {
    try {
      pushResult = await git.push("origin", repository.branch);
    } catch (error) {
      pushError = error.message;
    }
  }

  return {
    committed: Boolean(commitResult),
    pushed: Boolean(pushResult),
    branch: repository.branch,
    files: filesToCommit,
    commitSummary: commitResult?.summary || null,
    pushSummary: pushResult?.pushed || null,
    ...(pushError ? { pushError } : {}),
    ...(!repository.autoPush ? { pushSkipped: "自动推送已关闭" } : {}),
  };
}

export async function pushRepositoryBranch(repository) {
  const git = simpleGit(repository.path);
  await git.push("origin", repository.branch);
  return {
    pushed: true,
    branch: repository.branch,
  };
}
