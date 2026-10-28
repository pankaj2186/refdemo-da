/*
 * Pure helpers for the tag catalogue sheet. Rows keep the authored columns
 * ('Tag ID', Title, Path, Description) so the sheet stays editable in DA;
 * the tree is derived from Path, and missing ancestors count as tags too.
 */

export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const normalizePath = (path) => String(path ?? '').trim().replace(/^\/+|\/+$/g, '');

export const parentOf = (path) => path.split('/').slice(0, -1).join('/');

export const isWithin = (path, ancestor) => path === ancestor || path.startsWith(`${ancestor}/`);

export const toId = (title) => title.toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const toRow = ({
  id, title, path, description,
}) => ({
  'Tag ID': id, Title: title, Path: path, Description: description,
});

/**
 * Builds the tag tree from catalogue rows.
 * @param {object[]} rows Catalogue rows
 * @returns {Map<string, object>} Path to tag, including implied ancestors
 */
export function buildTree(rows) {
  const tree = new Map();
  rows.forEach((row) => {
    const path = normalizePath(row.Path);
    if (!path) return;
    const id = String(row['Tag ID'] ?? '').trim() || path.split('/').pop();
    tree.set(path, {
      path,
      id,
      title: String(row.Title ?? '').trim() || id,
      description: String(row.Description ?? '').trim(),
    });
  });
  [...tree.keys()].forEach((path) => {
    for (let parent = parentOf(path); parent; parent = parentOf(parent)) {
      if (tree.has(parent)) break;
      const id = parent.split('/').pop();
      tree.set(parent, {
        path: parent, id, title: id, description: '', implied: true,
      });
    }
  });
  return tree;
}

export const childrenOf = (tree, parentPath) => [...tree.values()]
  .filter((tag) => parentOf(tag.path) === parentPath)
  .sort((a, b) => a.title.localeCompare(b.title));

export function addTag(rows, {
  parent, id, title, description,
}) {
  const tree = buildTree(rows);
  const path = parent ? `${parent}/${id}` : id;
  if (parent && !tree.has(parent)) throw new Error(`Parent "${parent}" no longer exists.`);
  if (tree.has(path)) throw new Error(`"${path}" already exists.`);
  return [...rows, toRow({
    id, title, path, description,
  })];
}

/**
 * Updates a tag; a changed id moves the tag and all its descendants.
 * @returns {{rows: object[], path: string}} The new rows and the tag's new path
 */
export function updateTag(rows, target, { id, title, description }) {
  const tree = buildTree(rows);
  if (!tree.has(target)) throw new Error(`"${target}" no longer exists.`);
  const parent = parentOf(target);
  const path = parent ? `${parent}/${id}` : id;
  if (path !== target && tree.has(path)) throw new Error(`"${path}" already exists.`);

  let found = false;
  const updated = rows.map((row) => {
    const rowPath = normalizePath(row.Path);
    if (!isWithin(rowPath, target)) return row;
    if (rowPath !== target) return { ...row, Path: `${path}${rowPath.slice(target.length)}` };
    found = true;
    return {
      ...row,
      ...toRow({
        id, title, path, description,
      }),
    };
  });
  // an implied tag gets its own row once it is edited
  if (!found) {
    updated.push(toRow({
      id, title, path, description,
    }));
  }
  return { rows: updated, path };
}

export function removeTags(rows, paths) {
  const remaining = rows.filter((row) => {
    const rowPath = normalizePath(row.Path);
    return !paths.some((path) => isWithin(rowPath, path));
  });
  if (remaining.length === rows.length) throw new Error('No matching catalogue entries were found.');
  return remaining;
}
