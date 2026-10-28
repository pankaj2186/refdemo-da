
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { LitElement, html, nothing } from 'da-lit';

const CATALOGUE_PATH = 'config/tag-catalogue.json';

class TagManagement extends LitElement {
  static properties = {
    org: { type: String },
    repo: { type: String },
    token: { type: String },
    namespaces: { state: true },
    namespaceName: { state: true },
    description: { state: true },
    status: { state: true },
    busy: { state: true },
    selectedNamespace: { state: true },
    selectedParent: { state: true },
    tagName: { state: true },
    tagDescription: { state: true },
     activeNamespace: { state: true },
activeTagPath: { state: true },
checkedNamespaces: { state: true },
checkedTags: { state: true },
showCreateMenu: { state: true },
formMode: { state: true },
namespaceId: { state: true },
tagId: { state: true },
renameTarget: { state: true },
renameName: { state: true },
renameId: { state: true },
renameDescription: { state: true },
  };

  constructor() {
    super();
    this.namespaces = [];
    this.namespaceName = '';
    this.description = '';
    this.status = 'Loading namespaces...';
    this.busy = false;
    this.selectedNamespace = '';
    this.selectedParent = '';
    this.tagName = '';
    this.tagDescription = '';
    this.activeNamespace = '';
this.activeTagPath = [];
this.checkedNamespaces = [];
this.checkedTags = [];
this.showCreateMenu = false;
this.formMode = '';
this.namespaceId = '';
this.tagId = '';
this.renameTarget = null;
this.renameName = '';
this.renameId = '';
this.renameDescription = '';
  }

  async connectedCallback() {
    super.connectedCallback();
    await this.loadNamespaces();
  }

async getConfig() {
  const response = await fetch(
    `https://admin.da.live/source/${this.org}/${this.repo}/${CATALOGUE_PATH}`,
    {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Could not load catalogue (${response.status})`);
  }

  return response.json();
}

  
async loadNamespaces() {
  try {
    const catalogue = await this.getConfig();

    if (!Array.isArray(catalogue.data)) {
      throw new Error('Invalid tag catalogue format.');
    }

    this.namespaces = catalogue.data
      .filter((row) => row['Tag ID'] && row.Title && row.Path)
      .map((row) => ({
        tagId: String(row['Tag ID']).trim(),
        title: String(row.Title).trim(),
        path: String(row.Path).trim().replace(/^\/|\/$/g, ''),
      }));

    this.status = `${this.namespaces.length} tag(s) loaded.`;
  } catch (error) {
    this.status = error.message;
  }
}
 

async saveNamespace(event) {
  event.preventDefault();

  const id = this.namespaceId.trim().toLowerCase();
  const title = this.namespaceName.trim();
  const description = this.description.trim();

  if (!title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    this.status = 'Enter a namespace name and a valid ID using lowercase letters, numbers, and hyphens.';
    return false;
  }

  this.busy = true;
  this.status = 'Saving namespace...';

  try {
    const existing = await this.getConfig();
    const rows = existing.data || [];

    if (rows.some((row) =>
      row.Path === id || row['Tag ID'] === id
    )) {
      throw new Error(`Namespace "${id}" already exists.`);
    }

    const updatedCatalogue = {
      ...existing,
      total: rows.length + 1,
      data: [
        ...rows,
        {
          'Tag ID': id,
          Title: title,
          Path: id,
          Description: description,
        },
      ],
    };

    await this.saveCatalogue(updatedCatalogue);
    await this.loadNamespaces();

    this.namespaceName = '';
    this.namespaceId = '';
    this.description = '';
    this.status = `Namespace "${title}" saved successfully.`;

    return true;
  } catch (error) {
    this.status = error.message;
    return false;
  } finally {
    this.busy = false;
  }
}

async createTag(event) {
  event.preventDefault();

  const id = this.tagId.trim().toLowerCase();
  const title = this.tagName.trim();
  const description = this.tagDescription.trim();
  const parent = this.selectedParent;

  if (!parent) {
    console.log('activeNamespace:', this.activeNamespace);
  console.log('activeTagPath:', this.activeTagPath);
  console.log('selectedParent:', this.selectedParent);
    this.status = 'Select a namespace or tag before creating a tag.';
    return false;
  }

  if (!title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    this.status = 'Enter a name and a valid ID using lowercase letters, numbers, and hyphens.';
    return false;
  }

  this.busy = true;
  this.status = 'Saving tag...';

  try {
    const existing = await this.getConfig();
    const rows = existing.data || [];
    const fullPath = `${parent}/${id}`;

    if (!rows.some((row) => row.Path === parent)) {
      throw new Error(`Parent "${parent}" was not found in the catalogue.`);
    }

    if (rows.some((row) => row.Path === fullPath)) {
      throw new Error(`Tag "${id}" already exists under this parent.`);
    }

    const updatedCatalogue = {
      ...existing,
      total: rows.length + 1,
      data: [
        ...rows,
        {
          'Tag ID': id,
          Title: title,
          Path: fullPath,
          Description: description,
        },
      ],
    };

    await this.saveCatalogue(updatedCatalogue);
    await this.loadNamespaces();

    this.tagName = '';
    this.tagId = '';
    this.tagDescription = '';
    this.status = `Tag "${title}" saved successfully.`;

    return true;
  } catch (error) {
    this.status = error.message;
    return false;
  } finally {
    this.busy = false;
  }
}

getNamespaceRows() {
  const roots = new Map();

  (this.namespaces || []).forEach((tag) => {
    if (!tag || typeof tag.path !== 'string' || !tag.path.trim()) {
      return;
    }

    const parts = tag.path.split('/').filter(Boolean);
    const namespace = parts[0];

    if (namespace && !roots.has(namespace)) {
      roots.set(namespace, {
        namespace,
        title: namespace,
        path: namespace,
      });
    }
  });

  return [...roots.values()];
}

getTagChildren(parentPath) {
  const parent = parentPath.split('/').filter(Boolean);

  return (this.namespaces || []).filter((tag) => {
    const parts = tag.path.split('/').filter(Boolean);

    return (
      parts.length === parent.length + 1 &&
      parts.slice(0, -1).join('/') === parent.join('/')
    );
  });
}



selectNamespace(namespace) {
  this.activeNamespace = namespace;
  this.selectedNamespace = namespace;
  this.activeTagPath = [];
console.log('Selected namespace:', namespace);
}

selectTag(tag, depth) {
  this.activeTagPath = [
    ...(this.activeTagPath || []).slice(0, depth),
    tag,
  ];

  this.selectedParent = [
    this.activeNamespace,
    ...this.activeTagPath,
  ].filter(Boolean).join('/');

  this.selectedNamespace = this.activeNamespace;
}

getTagKey(namespace, parentPath, tag) {
  return `${namespace}:${[...parentPath, tag].join('/')}`;
}

getTagName(tag) {
  return tag.path.split('/').filter(Boolean).pop() || tag.title;
}

async deleteSelected() {
  const selectedNamespaces = this.checkedNamespaces || [];
  const selectedTags = this.checkedTags || [];

  if (
    selectedNamespaces.length === 0 &&
    selectedTags.length === 0
  ) {
    this.status = 'Select at least one namespace or tag to delete.';
    return;
  }

  // Convert checked tag keys into their full paths.
  // Example: products:products/shoes/running
  // becomes: products/shoes/running
  const selectedTagPaths = selectedTags.map((key) => {
    const separatorIndex = key.indexOf(':');
    return key.slice(separatorIndex + 1);
  });

  const selectedPaths = [
    ...selectedNamespaces,
    ...selectedTagPaths,
  ];

  const uniquePaths = [...new Set(selectedPaths)];

  const confirmed = window.confirm(
    `Are you sure you want to delete ${uniquePaths.length} selected item(s) and all their descendants?`
  );

  if (!confirmed) return;

  this.busy = true;
  this.status = 'Deleting selected items...';

  try {
    const existing = await this.getConfig();
    const rows = existing.data || [];

    // Remove redundant selections when a parent is already selected.
    const pathsToDelete = uniquePaths.filter(
      (path) =>
        !uniquePaths.some(
          (otherPath) =>
            otherPath !== path &&
            path.startsWith(`${otherPath}/`)
        )
    );

    // Remove each selected path and its descendants.
    const remainingRows = rows.filter((row) => {
      const path = String(row.Path || '')
        .trim()
        .replace(/^\/|\/$/g, '');

      return !pathsToDelete.some(
        (deletePath) =>
          path === deletePath ||
          path.startsWith(`${deletePath}/`)
      );
    });

    const deletedCount = rows.length - remainingRows.length;

    if (deletedCount === 0) {
      throw new Error('No matching catalogue entries were found.');
    }

    const updatedCatalogue = {
      ...existing,
      total: remainingRows.length,
      data: remainingRows,
    };

    await this.saveCatalogue(updatedCatalogue);
    await this.loadNamespaces();

    // Clear selections after a successful deletion.
    this.checkedNamespaces = [];
    this.checkedTags = [];

    // Reset the navigation to avoid pointing at deleted tags.
    if (
      pathsToDelete.some(
        (path) =>
          path === this.activeNamespace ||
          this.activeNamespace.startsWith(`${path}/`)
      )
    ) {
      this.activeNamespace = '';
      this.selectedNamespace = '';
      this.activeTagPath = [];
      this.selectedParent = '';
    } else {
      this.activeTagPath = [];
      this.selectedParent = this.activeNamespace;
    }

    this.status = `Successfully deleted ${deletedCount} catalogue entr${deletedCount === 1 ? 'y' : 'ies'}.`;
  } catch (error) {
    this.status = `Delete failed: ${error.message}`;
  } finally {
    this.busy = false;
  }
}


async renameSelected() {
  const selectedNamespaces = this.checkedNamespaces || [];
  const selectedTags = this.checkedTags || [];

  const selectedPaths = [
    ...selectedNamespaces,
    ...selectedTags.map((key) => key.slice(key.indexOf(':') + 1)),
  ];

  const uniquePaths = [...new Set(selectedPaths)];

  if (uniquePaths.length !== 1) {
    this.status = 'Select exactly one namespace or tag to rename.';
    return;
  }

  const targetPath = uniquePaths[0];

  // Avoid accidentally renaming a child when its parent is selected too.
  this.renameTarget = targetPath;

  try {
    const catalogue = await this.getConfig();
    const row = (catalogue.data || []).find(
      (item) => item.Path === targetPath,
    );

    if (!row) {
      this.status = 'Selected item was not found.';
      return;
    }

    this.renameName = row.Title || '';
    this.renameId = row['Tag ID'] || '';
    this.renameDescription = row.Description || '';
    this.formMode = 'rename';
    this.status = `Editing "${row.Title}"`;
  } catch (error) {
    this.status = `Could not load item: ${error.message}`;
  }
}

async saveRename(event) {
  event.preventDefault();

  const targetPath = this.renameTarget;
  const newTitle = this.renameName.trim();
  const newId = this.renameId.trim().toLowerCase();
  const newDescription = this.renameDescription.trim();

  if (!targetPath || !newTitle ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newId)) {
    this.status = 'Enter a name and a valid ID using lowercase letters, numbers, and hyphens.';
    return false;
  }

  this.busy = true;
  this.status = 'Renaming item...';

  try {
    const existing = await this.getConfig();
    const rows = existing.data || [];

    const target = rows.find((row) => row.Path === targetPath);

    if (!target) {
      throw new Error('Selected item no longer exists.');
    }

    const parentPath = targetPath.includes('/')
      ? targetPath.substring(0, targetPath.lastIndexOf('/'))
      : '';

    const newPath = parentPath
      ? `${parentPath}/${newId}`
      : newId;

    
if (
  newPath !== targetPath &&
  rows.some((row) => {
    const path = String(row.Path || '').trim();

    return (
      path === newPath ||
      path.startsWith(`${newPath}/`)
    );
  })
) {
  throw new Error(`The path "${newPath}" already exists.`);
}


    const updatedRows = rows.map((row) => {
  const oldPath = String(row.Path || '').trim();

  if (
    oldPath !== targetPath &&
    !oldPath.startsWith(`${targetPath}/`)
  ) {
    return row;
  }

      const updatedPath = oldPath === targetPath
        ? newPath
        : `${newPath}${oldPath.slice(targetPath.length)}`;

      if (oldPath === targetPath) {
        return {
          ...row,
          'Tag ID': newId,
          Title: newTitle,
          Path: updatedPath,
          Description: newDescription,
        };
      }

      return {
        ...row,
        Path: updatedPath,
      };
    });

    await this.saveCatalogue({
      ...existing,
      total: updatedRows.length,
      data: updatedRows,
    });

    await this.loadNamespaces();

    this.checkedNamespaces = [];
    this.checkedTags = [];
    this.renameTarget = null;
    this.formMode = '';

    this.activeNamespace = newPath.split('/')[0];
    this.selectedNamespace = this.activeNamespace;
    this.activeTagPath = newPath.split('/').slice(1);
    this.selectedParent = newPath;

    this.status = `"${newTitle}" renamed successfully.`;
    return true;
  } catch (error) {
    this.status = `Rename failed: ${error.message}`;
    return false;
  } finally {
    this.busy = false;
  }
}

async saveCatalogue(updatedCatalogue) {
  const formData = new FormData();

  formData.append(
    'data',
    new Blob(
      [JSON.stringify(updatedCatalogue, null, 2)],
      { type: 'application/json' },
    ),
    'tag-catalogue.json',
  );

  const response = await fetch(
    `https://admin.da.live/source/${this.org}/${this.repo}/${CATALOGUE_PATH}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      body: formData,
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Save failed (${response.status}): ${details}`);
  }
}

  
render() {
  const namespaceRows = this.getNamespaceRows();
  const namespace = this.activeNamespace || '';
  const tagPath = this.activeTagPath || [];

  const columns = [];

  if (namespace) {
    columns.push({
      title: `${namespace} tags`,
      parentPath: [],
      rows: this.getTagChildren(namespace),
    });

    tagPath.forEach((tag, depth) => {
      const parentPath = `${namespace}/${tagPath.slice(0, depth + 1).join('/')}`;

      columns.push({
        title: tag,
        parentPath,
        rows: this.getTagChildren(parentPath),
      });
    });
  }

  return html`
    <div class="manager">
      <header class="manager-header">
        <div>
          <h1>Tag Management</h1>
          <p>Manage namespaces and nested tags</p>
        </div>

        <div class="header-actions">
    
<button
  class="delete-button"
  ?disabled=${this.busy ||
    (this.checkedNamespaces.length === 0 &&
     this.checkedTags.length === 0)}
  @click=${() => this.deleteSelected()}
>
  Delete
</button>


    <button
      class="rename-button"
      ?disabled=${this.busy ||
        (this.checkedNamespaces.length === 0 &&
         this.checkedTags.length === 0)}
      @click=${() => this.renameSelected()}
    >
      Rename
    </button>

        <div class="create-menu">
          <button
            class="create-button"
            @click=${() => {
              this.showCreateMenu = !this.showCreateMenu;
            }}
          >
            + Create ▾
          </button>

          ${this.showCreateMenu
            ? html`
                <div class="create-dropdown">
                  <button
                    @click=${() => {
                      this.formMode = 'namespace';
                      this.showCreateMenu = false;
                    }}
                  >
                    Create namespace
                  </button>
                  <button
                    @click=${() => {
  this.formMode = 'tag';
  this.selectedNamespace = this.activeNamespace || '';

  this.selectedParent = this.activeTagPath.length
  ? `${this.activeNamespace}/${this.activeTagPath.join('/')}`
  : this.activeNamespace || '';

  this.tagName = '';
  this.tagId = '';
  this.tagDescription = '';
  this.showCreateMenu = false;
}}
                  >
                    Create tag
                  </button>
                </div>
              `
            : nothing}
        </div>
      </div>
      </header>

      

${this.formMode
  ? html`
      <section class="create-form">
        <h2>
          ${this.formMode === 'rename'
            ? 'Rename item'
            : this.formMode === 'namespace'
              ? 'Create namespace'
              : 'Create tag'}
        </h2>

        ${this.formMode === 'rename'
          ? html`
              <form @submit=${(event) => this.saveRename(event)}>
                <label>Name</label>
                <input
                  required
                  .value=${this.renameName}
                  @input=${(e) => {
                    this.renameName = e.target.value;
                  }}
                />

                <label>ID</label>
                <input
                  required
                  .value=${this.renameId}
                  @input=${(e) => {
                    this.renameId = e.target.value;
                  }}
                />

                <label>Description</label>
                <input
                  .value=${this.renameDescription}
                  @input=${(e) => {
                    this.renameDescription = e.target.value;
                  }}
                />

                <button type="submit" ?disabled=${this.busy}>
                  Save rename
                </button>

                <button
                  type="button"
                  @click=${() => {
                    this.formMode = '';
                    this.renameTarget = null;
                  }}
                >
                  Cancel
                </button>
              </form>
            `
          : this.formMode === 'namespace'
            ? html`
                <form @submit=${async (event) => {
                  if (await this.saveNamespace(event)) {
                    this.formMode = '';
                  }
                }}>
                  <label>Namespace name</label>
                  <input
                    required
                    .value=${this.namespaceName}
                    @input=${(e) => {
                      this.namespaceName = e.target.value;
                    }}
                    placeholder="e.g. Services"
                  />

                  <label>Namespace ID</label>
                  <input
                    required
                    .value=${this.namespaceId}
                    @input=${(e) => {
                      this.namespaceId = e.target.value;
                    }}
                    placeholder="e.g. services"
                  />

                  <label>Description</label>
                  <input
                    .value=${this.description}
                    @input=${(e) => {
                      this.description = e.target.value;
                    }}
                    placeholder="Describe this namespace"
                  />

                  <button type="submit" ?disabled=${this.busy}>
                    Save and close
                  </button>

                  <button
                    type="button"
                    @click=${() => {
                      this.formMode = '';
                    }}
                  >
                    Cancel
                  </button>
                </form>
              `
            : html`
                <form @submit=${async (event) => {
                  if (await this.createTag(event)) {
                    this.formMode = '';
                  }
                }}>
                  <label>Tag name</label>
                  <input
                    required
                    .value=${this.tagName}
                    @input=${(e) => {
                      this.tagName = e.target.value;
                    }}
                    placeholder="e.g. Running Shoes"
                  />

                  <label>Tag ID</label>
                  <input
                    required
                    .value=${this.tagId}
                    @input=${(e) => {
                      this.tagId = e.target.value;
                    }}
                    placeholder="e.g. running-shoes"
                  />

                  <label>Description</label>
                  <input
                    .value=${this.tagDescription}
                    @input=${(e) => {
                      this.tagDescription = e.target.value;
                    }}
                    placeholder="Describe this tag"
                  />

                  <button type="submit" ?disabled=${this.busy}>
                    Save and close
                  </button>

                  <button
                    type="button"
                    @click=${() => {
                      this.formMode = '';
                    }}
                  >
                    Cancel
                  </button>
                </form>
              `}
      </section>
    `
  : nothing}



      <div class="hierarchy">
        <section class="column">
          <h2>Namespaces</h2>

          ${namespaceRows.map((row) => html`
            <div
              class="tree-row ${namespace === row.namespace ? 'active' : ''}"
            >
              <input
                type="checkbox"
                .checked=${(this.checkedNamespaces || []).includes(
                  row.namespace,
                )}
                @change=${(event) => {
  const selected = new Set(this.checkedNamespaces || []);

  if (event.target.checked) {
    selected.add(row.namespace);
    this.selectNamespace(row.namespace);
  } else {
    selected.delete(row.namespace);

    if (this.activeNamespace === row.namespace) {
      this.activeNamespace = '';
      this.selectedNamespace = '';
      this.activeTagPath = [];
      this.selectedParent = '';
    }
  }

  this.checkedNamespaces = [...selected];
}}
              />

              <button
                class="row-select"
                @click=${() => this.selectNamespace(row.namespace)}
              >
                ${row.namespace}
                <span>›</span>
              </button>
            </div>
          `)}
        </section>

        ${columns.map((column, depth) => html`
          <section class="column">
            <h2>${column.title}</h2>

            ${column.rows.map((row) => {
              // const parentPath = column.parentPath;
              const tagName = this.getTagName(row);
const key = `${namespace}:${row.path}`;

              return html`
                <div
                  class="tree-row ${
                    tagPath[depth] === tagName ? 'active' : ''
                  }"
                >
                  <input
                    type="checkbox"
                    .checked=${(this.checkedTags || []).includes(key)}
                    @change=${(event) => {
                      const selected = new Set(this.checkedTags || []);
                      if (event.target.checked) selected.add(key);
                      else selected.delete(key);
                      this.checkedTags = [...selected];
                    }}
                  />

                  <button
                    class="row-select"
                    @click=${() => this.selectTag(tagName, depth)}
                  >
                    ${this.getTagName(row)}
${this.getTagChildren(row.path).length
  ? html`<span>›</span>`
  : nothing}
                  </button>
                </div>
              `;
            })}

            ${column.rows.length === 0
              ? html`<p class="empty">No child tags</p>`
              : nothing}
          </section>
        `)}
      </div>

      ${this.status
        ? html`<p class="status">${this.status}</p>`
        : nothing}
    </div>
  `;
}

}

customElements.define('tag-management-app', TagManagement);

(async () => {
  try {
    const { context, token } = await DA_SDK;

    const app = document.createElement('tag-management-app');
    app.org = context.org;
    app.repo = context.repo;
    app.token = token;

    document.body.append(app);
  } catch (error) {
    document.body.textContent =
      `Unable to initialize Tag Management: ${error.message}`;
  }
})();
