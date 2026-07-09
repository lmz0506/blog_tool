import { getDatabase } from "./storage/database.js";
import { getDefaultPlanSettings, updateDefaultPlanSettings } from "./settingsService.js";

function normalizeCategoryName(name) {
  return String(name || "").trim();
}

export function listCategories() {
  const db = getDatabase();
  return db
    .prepare(`
      SELECT
        c.id,
        c.name,
        c.display_name,
        c.source,
        c.enabled,
        c.is_default_pool,
        COUNT(a.id) AS article_count
      FROM categories c
      LEFT JOIN articles a ON a.category_name = c.name
      GROUP BY c.id
      ORDER BY c.name COLLATE NOCASE ASC
    `)
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      displayName: row.display_name || row.name,
      source: row.source,
      enabled: Boolean(row.enabled),
      isDefaultPool: Boolean(row.is_default_pool),
      articleCount: row.article_count,
    }));
}

export function listArticles(categoryName) {
  const db = getDatabase();
  const query = categoryName
    ? db.prepare(`
        SELECT * FROM articles
        WHERE category_name = ?
        ORDER BY published_at DESC, title ASC
      `)
    : db.prepare(`
        SELECT * FROM articles
        ORDER BY category_name ASC, published_at DESC, title ASC
      `);

  return (categoryName ? query.all(categoryName) : query.all()).map((row) => ({
    id: row.id,
    categoryName: row.category_name,
    title: row.title,
    filePath: row.file_path,
    slug: row.slug,
    publishedAt: row.published_at,
  }));
}

export function getCategoryById(categoryId) {
  const row = getDatabase()
    .prepare(`
      SELECT
        c.id,
        c.name,
        c.display_name,
        c.source,
        c.enabled,
        c.is_default_pool,
        COUNT(a.id) AS article_count
      FROM categories c
      LEFT JOIN articles a ON a.category_name = c.name
      WHERE c.id = ?
      GROUP BY c.id
    `)
    .get(categoryId);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name || row.name,
    source: row.source,
    enabled: Boolean(row.enabled),
    isDefaultPool: Boolean(row.is_default_pool),
    articleCount: row.article_count,
  };
}

export function getCategoryByName(categoryName) {
  const normalizedName = normalizeCategoryName(categoryName);
  if (!normalizedName) {
    return null;
  }

  return listCategories().find((category) => category.name === normalizedName) || null;
}

export function createCategory(input) {
  const name = normalizeCategoryName(input.name);
  if (!name) {
    throw new Error("分类名称不能为空。");
  }

  if (getCategoryByName(name)) {
    throw new Error(`分类「${name}」已存在。`);
  }

  return upsertCategory({
    ...input,
    name,
  });
}

export function updateCategory(categoryId, input) {
  const current = getCategoryById(categoryId);
  if (!current) {
    throw new Error(`分类不存在：${categoryId}`);
  }

  const nextName = normalizeCategoryName(input.name || current.name);
  if (!nextName) {
    throw new Error("分类名称不能为空。");
  }

  const duplicate = getCategoryByName(nextName);
  if (duplicate && duplicate.id !== current.id) {
    throw new Error(`分类「${nextName}」已存在。`);
  }

  return upsertCategory({
    ...current,
    ...input,
    name: nextName,
    source: input.source || current.source,
  });
}

function upsertCategory(input) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO categories (name, source, enabled, is_default_pool, updated_at)
    VALUES (@name, @source, @enabled, @isDefaultPool, CURRENT_TIMESTAMP)
    ON CONFLICT(name) DO UPDATE SET
      enabled = excluded.enabled,
      is_default_pool = excluded.is_default_pool,
      updated_at = CURRENT_TIMESTAMP
  `).run({
    name: normalizeCategoryName(input.name),
    source: input.source || "manual",
    enabled: input.enabled === false ? 0 : 1,
    isDefaultPool: input.isDefaultPool ? 1 : 0,
  });

  return listCategories().find((category) => category.name === normalizeCategoryName(input.name));
}

export function updateDefaultPlan(input) {
  return updateDefaultPlanSettings(input);
}

export function getDefaultPlan() {
  return getDefaultPlanSettings();
}
