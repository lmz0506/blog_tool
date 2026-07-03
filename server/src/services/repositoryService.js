import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";
import simpleGit from "simple-git";

import { getDatabase } from "./storage/database.js";
import { getRepositorySettings, updateRepositorySettings } from "./settingsService.js";

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readArticleMeta(fullPath, relativePath, category) {
  const raw = await readFile(fullPath, "utf8");
  const parsed = matter(raw);
  const publishedAt = parsed.data.date instanceof Date
    ? parsed.data.date.toISOString()
    : typeof parsed.data.date === "string"
      ? parsed.data.date
      : null;

  return {
    category,
    frontMatterCategory:
      typeof parsed.data.category === "string" && parsed.data.category.trim()
        ? parsed.data.category.trim()
        : null,
    title: parsed.data.title || path.basename(fullPath, path.extname(fullPath)),
    filePath: relativePath,
    slug: slugify(path.basename(fullPath, path.extname(fullPath))),
    publishedAt,
  };
}

function pickDisplayName(categoryArticles) {
  const counts = new Map();
  categoryArticles.forEach((article) => {
    if (article.frontMatterCategory) {
      counts.set(article.frontMatterCategory, (counts.get(article.frontMatterCategory) || 0) + 1);
    }
  });

  let displayName = null;
  let maxCount = 0;
  counts.forEach((count, name) => {
    if (count > maxCount) {
      maxCount = count;
      displayName = name;
    }
  });

  return displayName;
}

export function getRepositoryConfig() {
  return getRepositorySettings();
}

export function saveRepositoryConfig(input) {
  return updateRepositorySettings(input);
}

export async function scanRepository() {
  const repository = getRepositorySettings();
  const repositoryPath = repository.path;
  const docsRoot = path.join(repositoryPath, repository.docsDir);

  if (!(await pathExists(repositoryPath))) {
    throw new Error(`Repository path not found: ${repositoryPath}`);
  }

  if (!(await pathExists(path.join(repositoryPath, ".git")))) {
    throw new Error(`Not a git repository: ${repositoryPath}`);
  }

  if (!(await pathExists(docsRoot))) {
    throw new Error(`Docs directory not found: ${docsRoot}`);
  }

  const db = getDatabase();
  const categoryEntries = await readdir(docsRoot, { withFileTypes: true });
  const categories = [];
  const articles = [];

  for (const entry of categoryEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const category = entry.name;
    const categoryPath = path.join(docsRoot, category);
    const files = await readdir(categoryPath, { withFileTypes: true });
    const markdownFiles = files.filter(
      (file) => file.isFile() && file.name.toLowerCase().endsWith(".md"),
    );

    const categoryArticles = [];
    for (const file of markdownFiles) {
      const fullPath = path.join(categoryPath, file.name);
      const relativePath = `${repository.docsDir}/${category}/${file.name}`;
      categoryArticles.push(await readArticleMeta(fullPath, relativePath, category));
    }
    articles.push(...categoryArticles);

    // 目录名和文章 front-matter 中的 category 可能不同（如 devops 目录 → DevOps 分类），
    // 以已有文章中出现最多的 category 值作为展示分类名
    const displayName = pickDisplayName(categoryArticles);

    categories.push({
      name: category,
      displayName: displayName || category,
      path: `${repository.docsDir}/${category}`,
      articleCount: markdownFiles.length,
    });

    db.prepare(`
      INSERT INTO categories (name, display_name, source, enabled, updated_at)
      VALUES (@name, @displayName, 'blog_scan', 1, CURRENT_TIMESTAMP)
      ON CONFLICT(name) DO UPDATE SET
        source = 'blog_scan',
        display_name = COALESCE(excluded.display_name, display_name),
        updated_at = CURRENT_TIMESTAMP
    `).run({ name: category, displayName });
  }

  db.prepare("DELETE FROM articles").run();
  const insertArticle = db.prepare(`
    INSERT INTO articles (
      category_name, title, file_path, slug, published_at, updated_at
    ) VALUES (
      @category, @title, @filePath, @slug, @publishedAt, CURRENT_TIMESTAMP
    )
  `);
  articles.forEach((article) =>
    insertArticle.run({
      category: article.category,
      title: article.title,
      filePath: article.filePath,
      slug: article.slug,
      publishedAt: article.publishedAt,
    }),
  );

  const git = simpleGit(repositoryPath);
  const branch = await git.branchLocal();
  const remotes = await git.getRemotes(true);

  return {
    repository: {
      ...repository,
      currentBranch: branch.current,
      remotes: remotes.map((remote) => ({
        name: remote.name,
        fetch: remote.refs.fetch,
        push: remote.refs.push,
      })),
    },
    categories: categories.sort((left, right) => left.name.localeCompare(right.name, "zh-CN")),
    articles: articles.sort((left, right) => left.filePath.localeCompare(right.filePath, "zh-CN")),
  };
}
