// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html, nothing } from 'da-lit';
import loadStyle from '../../scripts/utils/styles.js';
import {
  ID_PATTERN,
  addTag,
  buildTree,
  childrenOf,
  isWithin,
  parentOf,
  removeTags,
  toId,
  updateTag,
} from './catalogue.js';

const CATALOGUE_PATH = 'config/tag-catalogue.json';
const EMPTY_SHEET = {
  total: 0, offset: 0, limit: 0, data: [], ':type': 'sheet',
};

const styles = await loadStyle(import.meta.url);

const folderIcon = html`<svg class="icon folder" viewBox="0 0 20 20" aria-hidden="true"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h4l2 2h7A1.5 1.5 0 0 1 18 6.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 15.5z"/></svg>`;
const chevronIcon = html`<svg class="icon chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4 13.5 10l-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;

class TagManagement extends LitElement {
  static properties = {
    org: { attribute: false },
    repo: { attribute: false },
    token: { attribute: false },
    tree: { state: true },
    activePath: { state: true },
    checked: { state: true },
    form: { state: true },
    pendingDelete: { state: true },
    status: { state: true },
    busy: { state: true },
    menuOpen: { state: true },
  };

  constructor() {
    super();
    this.tree = new Map();
    this.activePath = '';
    this.checked = [];
    this.form = null;
    this.pendingDelete = [];
    this.status = 'Loading tags...';
    this.busy = false;
    this.menuOpen = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this.load();
  }

  get catalogueUrl() {
    return `https://admin.da.live/source/${this.org}/${this.repo}/${CATALOGUE_PATH}`;
  }

  async fetchSheet() {
    const response = await fetch(this.catalogueUrl, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
    });
    // no catalogue yet: start empty so the first namespace can be created
    if (response.status === 404) return { ...EMPTY_SHEET };
    if (!response.ok) throw new Error(`Could not load the tag catalogue (${response.status}).`);
    const sheet = await response.json();
    if (!Array.isArray(sheet.data)) throw new Error('Invalid tag catalogue format: expected a single sheet.');
    return sheet;
  }

  async saveSheet(sheet, data) {
    const body = new FormData();
    const json = JSON.stringify({
      ...sheet, total: data.length, offset: 0, limit: data.length, data,
    }, null, 2);
    body.append('data', new Blob([json], { type: 'application/json' }), 'tag-catalogue.json');
    const response = await fetch(this.catalogueUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` },
      body,
    });
    if (!response.ok) throw new Error(`Save failed (${response.status}).`);
  }

  async load() {
    try {
      const { data } = await this.fetchSheet();
      this.tree = buildTree(data);
      this.status = `${this.tree.size} tag(s) loaded.`;
    } catch (error) {
      this.status = error.message;
    }
  }

  /**
   * Re-reads the catalogue, applies a change to its rows and saves it.
   * ponytail: last write wins; DA source has no conditional save to detect concurrent edits.
   * @param {function} change Takes the rows, returns the new rows
   * @returns {Promise<boolean>} Whether the save succeeded
   */
  async mutate(change, progress) {
    this.busy = true;
    this.status = progress;
    try {
      const sheet = await this.fetchSheet();
      await this.saveSheet(sheet, change(sheet.data));
      await this.load();
      return true;
    } catch (error) {
      this.status = error.message;
      return false;
    } finally {
      this.busy = false;
    }
  }

  get columns() {
    const parents = [''];
    this.activePath.split('/').filter(Boolean).forEach((id, index) => {
      parents.push(parents[index] ? `${parents[index]}/${id}` : id);
    });
    return parents
      .map((parent) => ({ parent, tags: childrenOf(this.tree, parent) }))
      .filter(({ parent, tags }) => !parent || tags.length);
  }

  hasChildren(path) {
    return [...this.tree.keys()].some((key) => parentOf(key) === path);
  }

  toggleChecked(path, checked) {
    const selected = new Set(this.checked);
    if (checked) selected.add(path);
    else selected.delete(path);
    this.checked = [...selected];
  }

  selectAll() {
    const { tags } = this.columns.at(-1);
    this.checked = tags.map((tag) => tag.path);
  }

  /**
   * Opens the create form; a namespace goes at the root, a tag under the
   * checked item, or under the open folder when nothing is checked.
   * @param {'namespace'|'tag'} kind What to create
   */
  openCreate(kind) {
    const tagParent = this.checked.length === 1 ? this.checked[0] : this.activePath;
    this.form = {
      mode: 'create',
      parent: kind === 'namespace' ? '' : tagParent,
      title: '',
      id: '',
      description: '',
      idEdited: false,
    };
    this.menuOpen = false;
    this.status = '';
  }

  openEdit() {
    const tag = this.tree.get(this.checked[0]);
    if (!tag) return;
    this.form = {
      mode: 'edit',
      target: tag.path,
      parent: parentOf(tag.path),
      title: tag.title,
      id: tag.id,
      description: tag.description,
      idEdited: true,
    };
    this.status = '';
  }

  updateForm(field, value) {
    const form = { ...this.form, [field]: value };
    if (field === 'id') form.idEdited = true;
    if (field === 'title' && !form.idEdited) form.id = toId(value);
    this.form = form;
  }

  async submitForm(event) {
    event.preventDefault();
    const { mode, parent, target } = this.form;
    const values = {
      id: this.form.id.trim().toLowerCase(),
      title: this.form.title.trim(),
      description: this.form.description.trim(),
    };
    if (!values.title || !ID_PATTERN.test(values.id)) {
      this.status = 'Enter a title and a name using lowercase letters, numbers and hyphens.';
      return;
    }

    let newPath;
    const saved = await this.mutate((rows) => {
      if (mode === 'create') return addTag(rows, { parent, ...values });
      const result = updateTag(rows, target, values);
      newPath = result.path;
      return result.rows;
    }, 'Saving...');
    if (!saved) return;

    if (mode === 'edit' && isWithin(this.activePath, target)) {
      this.activePath = `${newPath}${this.activePath.slice(target.length)}`;
    }
    this.checked = [];
    this.form = null;
    this.status = `"${values.title}" saved.`;
  }

  confirmDelete() {
    // a checked descendant of a checked tag goes with its ancestor
    this.pendingDelete = this.checked.filter((path) => !this.checked
      .some((other) => other !== path && isWithin(path, other)));
    this.updateComplete.then(() => this.shadowRoot.querySelector('dialog').showModal());
  }

  async deletePending() {
    this.shadowRoot.querySelector('dialog').close();
    const paths = this.pendingDelete;
    const deleted = await this.mutate((rows) => removeTags(rows, paths), 'Deleting...');
    if (!deleted) return;
    const removed = paths.find((path) => isWithin(this.activePath, path));
    if (removed !== undefined) this.activePath = parentOf(removed);
    this.checked = [];
    this.status = `Deleted ${paths.length} item(s) and their descendants.`;
  }

  renderToolbar() {
    const count = this.checked.length;
    if (count) {
      return html`
        <div class="toolbar actions">
          <button class="action" ?disabled=${this.busy || count > 1} @click=${() => this.openCreate('tag')}>+ Create Tag</button>
          <button class="action" ?disabled=${this.busy || count !== 1} @click=${this.openEdit}>Edit</button>
          <button class="action" ?disabled=${this.busy} @click=${this.confirmDelete}>Delete</button>
          <span class="spacer"></span>
          <span>${count} selected</span>
          <button class="quiet" @click=${() => { this.checked = []; }}>Clear selection</button>
        </div>`;
    }
    return html`
      <div class="toolbar">
        <h1>Tag Management</h1>
        <span class="spacer"></span>
        <button class="quiet" @click=${this.selectAll}>Select All</button>
        <div
          class="create-menu"
          @focusout=${(e) => { if (!e.currentTarget.contains(e.relatedTarget)) this.menuOpen = false; }}
          @keydown=${(e) => { if (e.key === 'Escape') this.menuOpen = false; }}
        >
          <button
            class="primary"
            aria-haspopup="true"
            aria-expanded=${this.menuOpen}
            ?disabled=${this.busy}
            @click=${() => { this.menuOpen = !this.menuOpen; }}
          >Create ▾</button>
          ${this.menuOpen ? html`
            <div class="create-dropdown">
              <button @click=${() => this.openCreate('namespace')}>Create a namespace</button>
              <button
                ?disabled=${!this.activePath}
                title=${this.activePath ? `Creates under /${this.activePath}` : 'Open a namespace first'}
                @click=${() => this.openCreate('tag')}
              >Create a tag</button>
            </div>` : nothing}
        </div>
      </div>`;
  }

  renderRow(tag) {
    const checked = this.checked.includes(tag.path);
    const active = isWithin(this.activePath, tag.path);
    return html`
      <li class="row ${active ? 'active' : ''} ${checked ? 'checked' : ''}">
        <input
          type="checkbox"
          aria-label="Select ${tag.title}"
          .checked=${checked}
          @change=${(e) => this.toggleChecked(tag.path, e.target.checked)}
        />
        <button class="row-open" aria-current=${active ? 'true' : nothing} @click=${() => { this.activePath = tag.path; }}>
          ${folderIcon}
          <span class="title">${tag.title}</span>
          ${this.hasChildren(tag.path) ? chevronIcon : nothing}
        </button>
      </li>`;
  }

  renderDetails() {
    const path = this.checked.length === 1 ? this.checked[0] : this.activePath;
    const tag = this.tree.get(path);
    if (!tag) return nothing;
    return html`
      <aside class="details" aria-label="Tag details">
        <div class="preview">${folderIcon}</div>
        <dl>
          <dt>Title</dt><dd>${tag.title}</dd>
          <dt>Name</dt><dd>${tag.id}</dd>
          <dt>Path</dt><dd>/${tag.path}</dd>
          ${tag.description ? html`<dt>Description</dt><dd>${tag.description}</dd>` : nothing}
        </dl>
      </aside>`;
  }

  renderBrowser() {
    return html`
      ${this.renderToolbar()}
      <div class="browser">
        ${this.columns.map(({ parent, tags }) => html`
          <section class="column" aria-label=${parent ? `Tags in /${parent}` : 'Namespaces'}>
            ${tags.length
    ? html`<ul>${tags.map((tag) => this.renderRow(tag))}</ul>`
    : html`<p class="empty">No tags yet. Use Create to add a namespace.</p>`}
          </section>`)}
        ${this.renderDetails()}
      </div>
      <dialog @close=${() => { this.pendingDelete = []; }}>
        <h2>Delete tags</h2>
        <p>These items and everything under them will be deleted:</p>
        <ul class="paths">${this.pendingDelete.map((path) => html`<li>/${path}</li>`)}</ul>
        <div class="dialog-actions">
          <button class="secondary" @click=${() => this.shadowRoot.querySelector('dialog').close()}>Cancel</button>
          <button class="danger" @click=${this.deletePending}>Delete</button>
        </div>
      </dialog>`;
  }

  renderForm() {
    const {
      mode, parent, title, id, description,
    } = this.form;
    const noun = parent ? 'Tag' : 'Namespace';
    return html`
      <form class="tag-form" @submit=${this.submitForm}>
        <div class="toolbar form-header">
          <h1>${mode === 'create' ? 'Create' : 'Edit'} ${noun}</h1>
          <span class="spacer"></span>
          <button type="button" class="secondary" @click=${() => { this.form = null; }}>Cancel</button>
          <button type="submit" class="primary" ?disabled=${this.busy}>Submit</button>
        </div>
        <div class="fields">
          <label for="tag-title">Title *</label>
          <input id="tag-title" required .value=${title} @input=${(e) => this.updateForm('title', e.target.value)} />

          <label for="tag-id">Name *</label>
          <input
            id="tag-id"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            aria-describedby="tag-id-hint"
            .value=${id}
            @input=${(e) => this.updateForm('id', e.target.value)}
          />
          <p id="tag-id-hint" class="hint">Lowercase letters, numbers and hyphens.${mode === 'edit' ? ' Changing it moves the tag and its children.' : ''}</p>

          <label for="tag-description">Description</label>
          <textarea id="tag-description" rows="5" .value=${description} @input=${(e) => this.updateForm('description', e.target.value)}></textarea>

          ${parent ? html`
            <label for="tag-path">Tag Path</label>
            <input id="tag-path" readonly .value=${`/${parent}`} />` : nothing}
        </div>
      </form>`;
  }

  render() {
    return html`
      ${this.form ? this.renderForm() : this.renderBrowser()}
      <p class="status" role="status">${this.status}</p>`;
  }
}

customElements.define('tag-management-app', TagManagement);

(async function init() {
  try {
    const { context, token } = await DA_SDK;
    const app = document.createElement('tag-management-app');
    app.org = context.org;
    app.repo = context.repo;
    app.token = token;
    document.body.append(app);
  } catch (error) {
    document.body.textContent = `Unable to initialize Tag Management: ${error.message}`;
  }
}());
