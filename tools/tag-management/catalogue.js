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


/**
 * Moves a tag and all its descendants under a new parent.
 * An empty newParent means the root level.
 */
export function moveTags(rows, targets, newParent) {
  const tree = buildTree(rows);
  const destination = normalizePath(newParent);

  // Remove duplicate selections and children of selected parents.
  const selected = [...new Set(targets.map(normalizePath))];
  const sources = selected.filter((path) =>
    !selected.some(
      (other) => other !== path && isWithin(path, other),
    ),
  );

  if (!sources.length) {
    throw new Error('Select at least one tag to move.');
  }

  for (const source of sources) {
    if (!tree.has(source)) {
      throw new Error(`"${source}" no longer exists.`);
    }

    if (destination && !tree.has(destination)) {
      throw new Error('The destination parent no longer exists.');
    }

    if (destination && isWithin(destination, source)) {
      throw new Error('A tag cannot be moved inside itself or its descendants.');
    }
  }

  const moves = sources.map((source) => {
    const id = source.split('/').pop();
    const path = destination ? `${destination}/${id}` : id;

    return { source, path, tag: tree.get(source) };
  });

  const movingSources = moves.map((move) => move.source);

  for (const move of moves) {
    if (
      move.path !== move.source &&
      tree.has(move.path) &&
      !movingSources.some((source) =>
        isWithin(move.path, source),
      )
    ) {
      throw new Error(`"${move.path}" already exists.`);
    }
  }

  const updated = rows.map((row) => {
    const rowPath = normalizePath(row.Path);
    const move = moves.find((item) =>
      isWithin(rowPath, item.source),
    );

    if (!move) return row;

    return {
      ...row,
      Path: `${move.path}${rowPath.slice(move.source.length)}`,
    };
  });

  // An implied tag might not have its own catalogue row.
  for (const move of moves) {
    if (!rows.some(
      (row) => normalizePath(row.Path) === move.source,
    )) {
      updated.push({
        'Tag ID': move.tag.id,
        Title: move.tag.title,
        Path: move.path,
        Description: move.tag.description,
      });
    }
  }

  return updated;
}
