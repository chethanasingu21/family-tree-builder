const api = {
  async request(path, options = {}) {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text };
    }
    if (!response.ok) {
      const message = data.error || data.message || `Request failed with status ${response.status}`;
      throw new Error(message);
    }
    return data;
  },
  listTrees() {
    return this.request("/api/trees");
  },
  createTree(treeName, passcode) {
    return this.request("/api/trees", {
      method: "POST",
      body: JSON.stringify({ treeName, passcode }),
    });
  },
  loadTree(id) {
    return this.request(`/api/trees/${id}`);
  },
  verifyTree(id, passcode) {
    return this.request(`/api/trees/${id}/verify`, {
      method: "POST",
      body: JSON.stringify({ passcode }),
    });
  },
  saveTree(id, passcode, data) {
    return this.request(`/api/trees/${id}`, {
      method: "PUT",
      body: JSON.stringify({ passcode, data }),
    });
  },
  deleteTree(id, passcode) {
    return this.request(`/api/trees/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ passcode }),
    });
  },
};

const state = {
  treeId: null,
  treeName: "My family tree",
  passcode: "",
  unlocked: false,
  people: [],
  parentLinks: [],
  partnerLinks: [],
  siblingLinks: [],
  selectedId: null,
};

const form = document.querySelector("#personForm");
const editForm = document.querySelector("#editForm");
const relationshipType = document.querySelector("#relationshipType");
const relationshipDetail = document.querySelector("#relationshipDetail");
const birthOrderInput = document.querySelector("#birthOrderInput");
const peopleList = document.querySelector("#peopleList");
const selectedCard = document.querySelector("#selectedCard");
const treeNameInput = document.querySelector("#treeNameInput");
const passcodeInput = document.querySelector("#passcodeInput");
const saveTreeButton = document.querySelector("#saveTreeButton");
const createTreeButton = document.querySelector("#createTreeButton");
const unlockTreeButton = document.querySelector("#unlockTreeButton");
const newTreeButton = document.querySelector("#newTreeButton");
const deleteTreeButton = document.querySelector("#deleteTreeButton");
const savedTreesList = document.querySelector("#savedTreesList");
const editRelationship = document.querySelector("#editRelationship");
const editBirthOrder = document.querySelector("#editBirthOrder");
const deletePersonButton = document.querySelector("#deletePersonButton");
const searchInput = document.querySelector("#searchInput");
const emptyState = document.querySelector("#emptyState");
const treeCanvas = document.querySelector("#treeCanvas");
const nodeLayer = document.querySelector("#nodeLayer");
const linkLayer = document.querySelector("#linkLayer");
const personCount = document.querySelector("#personCount");
const generationCount = document.querySelector("#generationCount");
const treeTitle = document.querySelector("#treeTitle");
const accessStatus = document.querySelector("#accessStatus");
const exportButton = document.querySelector("#exportButton");
const importFile = document.querySelector("#importFile");
const resetButton = document.querySelector("#resetButton");

const relationshipLabels = {
  root: "Start a new tree",
  father: "Father",
  mother: "Mother",
  parent: "Parent",
  grandfather: "Grandfather",
  grandmother: "Grandmother",
  elder_sister: "Elder sister",
  younger_sister: "Younger sister",
  elder_brother: "Elder brother",
  younger_brother: "Younger brother",
  sibling: "Sibling",
  partner: "Partner",
  child: "Child",
  son: "Son",
  daughter: "Daughter",
  grandchild: "Grandchild",
};

function createId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePair(a, b) {
  return [a, b].sort().join("|");
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "?";
}

function assertCanEdit() {
  if (!state.treeId) throw new Error("Create or load a tree first.");
  if (!state.unlocked || !state.passcode) throw new Error("Enter the 4-digit passcode to make changes.");
}

function getPerson(id) {
  return state.people.find((person) => person.id === id);
}

function getParents(id) {
  return state.parentLinks.filter((link) => link.child === id);
}

function getChildren(id) {
  return state.parentLinks.filter((link) => link.parent === id);
}

function getSiblingLinks(id) {
  return state.siblingLinks.filter((link) => link.a === id || link.b === id);
}

function personLabel(id) {
  return getPerson(id)?.name || "Unknown";
}

function serializeTree() {
  return {
    treeName: state.treeName,
    people: state.people,
    parentLinks: state.parentLinks,
    partnerLinks: state.partnerLinks,
    siblingLinks: state.siblingLinks,
    selectedId: state.selectedId,
  };
}

async function persist() {
  assertCanEdit();
  state.treeName = treeNameInput.value.trim() || "My family tree";
  await api.saveTree(state.treeId, state.passcode, serializeTree());
  await renderSavedTrees();
}

function applyTree(tree) {
  state.treeId = tree.id || state.treeId;
  state.treeName = tree.treeName || tree.name || "My family tree";
  state.people = Array.isArray(tree.people) ? tree.people : [];
  state.parentLinks = Array.isArray(tree.parentLinks) ? tree.parentLinks : [];
  state.partnerLinks = Array.isArray(tree.partnerLinks) ? tree.partnerLinks : [];
  state.siblingLinks = Array.isArray(tree.siblingLinks) ? tree.siblingLinks : [];
  state.selectedId = tree.selectedId || state.people[0]?.id || null;
}

function makePerson(formData) {
  return {
    id: createId(),
    name: formData.get("name").trim(),
    born: formData.get("born").trim(),
    place: formData.get("place").trim(),
    notes: formData.get("notes").trim(),
    relationship: "",
    birthOrder: formData.get("birthOrder").trim(),
    createdAt: new Date().toISOString(),
  };
}

function addParentLink(parent, child, relation) {
  if (parent === child) return;
  const existing = state.parentLinks.find((link) => link.parent === parent && link.child === child);
  if (existing) {
    existing.relation = relation || existing.relation;
    return;
  }
  state.parentLinks.push({ parent, child, relation });
}

function addSiblingLink(a, b, relation) {
  if (a === b) return;
  const key = normalizePair(a, b);
  const existing = state.siblingLinks.find((link) => normalizePair(link.a, link.b) === key);
  if (existing) {
    existing.relation = relation || existing.relation;
    return;
  }
  state.siblingLinks.push({ a, b, relation });
}

function addPartnerLink(a, b) {
  if (a === b) return;
  const key = normalizePair(a, b);
  const exists = state.partnerLinks.some((link) => normalizePair(link.a, link.b) === key);
  if (!exists) state.partnerLinks.push({ a, b });
}

function addRelative(person, relation) {
  const selected = getPerson(state.selectedId);
  person.relationship = relation === "root" ? "" : relationshipLabels[relation] || "";
  state.people.push(person);

  if (!selected || relation === "root") {
    state.selectedId = person.id;
    return;
  }

  if (["father", "mother", "parent"].includes(relation)) addParentLink(person.id, selected.id, relation);
  if (["child", "son", "daughter"].includes(relation)) addParentLink(selected.id, person.id, relation);
  if (relation === "partner") addPartnerLink(selected.id, person.id);
  if (["elder_sister", "younger_sister", "elder_brother", "younger_brother", "sibling"].includes(relation)) {
    addSiblingLink(selected.id, person.id, relation);
    getParents(selected.id).forEach((link) => addParentLink(link.parent, person.id, link.relation));
  }
  if (["grandfather", "grandmother"].includes(relation)) {
    const parents = getParents(selected.id);
    if (parents.length) addParentLink(person.id, parents[0].parent, relation);
    else addParentLink(person.id, selected.id, relation);
  }
  if (relation === "grandchild") {
    const children = getChildren(selected.id);
    if (children.length) addParentLink(children[0].child, person.id, relation);
    else addParentLink(selected.id, person.id, relation);
  }

  state.selectedId = person.id;
}

function updateSelectedPerson(formData) {
  const selected = getPerson(state.selectedId);
  if (!selected) return;
  selected.name = formData.get("name").trim();
  selected.born = formData.get("born").trim();
  selected.place = formData.get("place").trim();
  selected.relationship = formData.get("relationship").trim();
  selected.birthOrder = formData.get("birthOrder").trim();
  selected.notes = formData.get("notes").trim();
}

function deleteSelectedPerson() {
  const selected = getPerson(state.selectedId);
  if (!selected) return;
  state.people = state.people.filter((person) => person.id !== selected.id);
  state.parentLinks = state.parentLinks.filter((link) => link.parent !== selected.id && link.child !== selected.id);
  state.partnerLinks = state.partnerLinks.filter((link) => link.a !== selected.id && link.b !== selected.id);
  state.siblingLinks = state.siblingLinks.filter((link) => link.a !== selected.id && link.b !== selected.id);
  state.selectedId = state.people[0]?.id || null;
}

function computeGenerations() {
  const generations = new Map();
  state.people.forEach((person) => generations.set(person.id, 0));
  for (let pass = 0; pass < state.people.length + 2; pass += 1) {
    let changed = false;
    state.parentLinks.forEach((link) => {
      const parentLevel = generations.get(link.parent) ?? 0;
      const childLevel = generations.get(link.child) ?? 0;
      if (childLevel <= parentLevel) {
        generations.set(link.child, parentLevel + 1);
        changed = true;
      }
    });
    if (!changed) break;
  }
  return generations;
}

function layoutTree() {
  const generations = computeGenerations();
  const groups = new Map();
  state.people.forEach((person) => {
    const level = generations.get(person.id) ?? 0;
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level).push(person);
  });

  const positions = new Map();
  const nodeWidth = 190;
  const nodeHeight = 116;
  const xGap = 58;
  const yGap = 96;
  const padding = 44;
  const levels = [...groups.keys()].sort((a, b) => a - b);

  levels.forEach((level) => groups.get(level).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));

  const canvasWidth = Math.max(
    920,
    ...levels.map((level) => padding * 2 + groups.get(level).length * nodeWidth + (groups.get(level).length - 1) * xGap)
  );

  levels.forEach((level) => {
    const people = groups.get(level);
    const rowWidth = people.length * nodeWidth + Math.max(0, people.length - 1) * xGap;
    const startX = Math.max(padding, (canvasWidth - rowWidth) / 2);
    people.forEach((person, index) => {
      positions.set(person.id, {
        x: startX + index * (nodeWidth + xGap),
        y: padding + level * (nodeHeight + yGap),
        width: nodeWidth,
        height: nodeHeight,
      });
    });
  });

  const canvasHeight = Math.max(640, padding * 2 + levels.length * nodeHeight + Math.max(0, levels.length - 1) * yGap);
  return { positions, canvasWidth, canvasHeight, generations };
}

function drawLinks(layout) {
  linkLayer.innerHTML = "";
  linkLayer.setAttribute("viewBox", `0 0 ${layout.canvasWidth} ${layout.canvasHeight}`);
  const drawPath = (d, className) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("class", className);
    linkLayer.append(path);
  };

  state.parentLinks.forEach((link) => {
    const parent = layout.positions.get(link.parent);
    const child = layout.positions.get(link.child);
    if (!parent || !child) return;
    const startX = parent.x + parent.width / 2;
    const startY = parent.y + parent.height;
    const endX = child.x + child.width / 2;
    const endY = child.y;
    const midY = startY + (endY - startY) / 2;
    drawPath(`M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`, "link");
  });

  state.partnerLinks.forEach((link) => {
    const a = layout.positions.get(link.a);
    const b = layout.positions.get(link.b);
    if (!a || !b) return;
    drawPath(`M ${a.x + a.width} ${a.y + a.height / 2} L ${b.x} ${b.y + b.height / 2}`, "partner-link");
  });

  state.siblingLinks.forEach((link) => {
    const a = layout.positions.get(link.a);
    const b = layout.positions.get(link.b);
    if (!a || !b) return;
    drawPath(`M ${a.x + a.width / 2} ${a.y + a.height + 14} L ${b.x + b.width / 2} ${b.y + b.height + 14}`, "sibling-link");
  });
}

function renderNodes(layout) {
  nodeLayer.innerHTML = "";
  treeCanvas.style.width = `${layout.canvasWidth}px`;
  treeCanvas.style.height = `${layout.canvasHeight}px`;
  state.people.forEach((person) => {
    const position = layout.positions.get(person.id);
    const node = document.createElement("button");
    node.type = "button";
    node.className = `tree-node${person.id === state.selectedId ? " is-selected" : ""}`;
    node.style.left = `${position.x}px`;
    node.style.top = `${position.y}px`;
    node.innerHTML = `
      <h3>${escapeHtml(person.name)}</h3>
      <p class="node-meta">
        ${person.relationship ? `<small>${escapeHtml(person.relationship)}</small>` : ""}
        ${person.birthOrder ? `<small>${escapeHtml(person.birthOrder)}</small>` : ""}
        ${person.born ? `<small>Born ${escapeHtml(person.born)}</small>` : ""}
        ${person.place ? `<small>${escapeHtml(person.place)}</small>` : ""}
      </p>
    `;
    node.addEventListener("click", () => {
      state.selectedId = person.id;
      render();
    });
    nodeLayer.append(node);
  });
}

function renderSelected() {
  const selected = getPerson(state.selectedId);
  if (!selected) {
    selectedCard.innerHTML = `<h2>Selected person</h2><p class="muted">Pick a person in the tree to connect relatives.</p>`;
    editForm.reset();
    return;
  }

  const parents = getParents(selected.id).map((link) => `${relationshipLabels[link.relation] || "Parent"}: ${personLabel(link.parent)}`);
  const children = getChildren(selected.id).map((link) => `${relationshipLabels[link.relation] || "Child"}: ${personLabel(link.child)}`);
  const siblings = getSiblingLinks(selected.id).map((link) => {
    const other = link.a === selected.id ? link.b : link.a;
    return `${relationshipLabels[link.relation] || "Sibling"}: ${personLabel(other)}`;
  });

  selectedCard.innerHTML = `
    <h2>Selected person</h2>
    <dl>
      <dt>Name</dt><dd>${escapeHtml(selected.name)}</dd>
      ${selected.relationship ? `<dt>Detail</dt><dd>${escapeHtml(selected.relationship)}</dd>` : ""}
      ${selected.birthOrder ? `<dt>Birth order</dt><dd>${escapeHtml(selected.birthOrder)}</dd>` : ""}
      <dt>Parents</dt><dd>${parents.length ? parents.map(escapeHtml).join("<br>") : "None added yet"}</dd>
      <dt>Siblings</dt><dd>${siblings.length ? siblings.map(escapeHtml).join("<br>") : "None added yet"}</dd>
      <dt>Children</dt><dd>${children.length ? children.map(escapeHtml).join("<br>") : "None added yet"}</dd>
      ${selected.notes ? `<dt>Notes</dt><dd>${escapeHtml(selected.notes)}</dd>` : ""}
    </dl>
  `;

  editForm.elements.name.value = selected.name;
  editForm.elements.born.value = selected.born || "";
  editForm.elements.place.value = selected.place || "";
  editForm.elements.relationship.value = selected.relationship || "";
  editForm.elements.birthOrder.value = selected.birthOrder || "";
  editForm.elements.notes.value = selected.notes || "";
}

function renderPeopleList() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = state.people.filter((person) => [person.name, person.born, person.place, person.relationship, person.birthOrder, person.notes].join(" ").toLowerCase().includes(query));
  peopleList.innerHTML = "";
  if (!filtered.length) {
    peopleList.innerHTML = `<p class="muted">No matching people yet.</p>`;
    return;
  }
  filtered.forEach((person) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `person-row${person.id === state.selectedId ? " is-active" : ""}`;
    button.innerHTML = `
      <span class="avatar">${escapeHtml(initials(person.name))}</span>
      <span>
        <strong>${escapeHtml(person.name)}</strong><br>
        <small>${escapeHtml([person.relationship, person.birthOrder, person.born].filter(Boolean).join(" - ") || "No details yet")}</small>
      </span>
    `;
    button.addEventListener("click", () => {
      state.selectedId = person.id;
      render();
    });
    peopleList.append(button);
  });
}

function renderAccess() {
  const canEdit = state.treeId && state.unlocked;
  accessStatus.textContent = state.treeId
    ? canEdit ? "Editing unlocked" : "View only until passcode is entered"
    : "Create a tree with a 4-digit passcode";
  [...form.elements, ...editForm.elements].forEach((field) => {
    field.disabled = !canEdit || (editForm.contains(field) && !getPerson(state.selectedId));
  });
  saveTreeButton.disabled = !canEdit;
  deleteTreeButton.disabled = !canEdit;
  resetButton.disabled = !canEdit;
}

function renderStats(layout) {
  treeNameInput.value = state.treeName;
  personCount.textContent = state.people.length;
  generationCount.textContent = state.people.length ? Math.max(...layout.generations.values()) + 1 : 0;
  treeTitle.textContent = state.treeName || "Your family tree";
}

async function renderSavedTrees() {
  const { trees } = await api.listTrees();
  savedTreesList.innerHTML = trees.length ? "" : `<p class="muted">No backend trees yet.</p>`;
  trees.forEach((tree) => {
    const row = document.createElement("div");
    row.className = "saved-tree-row";
    row.innerHTML = `
      <button type="button" data-action="load">
        <strong>${escapeHtml(tree.name)}</strong>
        <small>${tree.peopleCount || 0} people</small>
      </button>
    `;
    row.querySelector("[data-action='load']").addEventListener("click", async () => {
      const loaded = await api.loadTree(tree.id);
      state.passcode = "";
      state.unlocked = false;
      passcodeInput.value = "";
      applyTree(loaded.tree);
      render();
    });
    savedTreesList.append(row);
  });
}

function render() {
  emptyState.hidden = state.people.length > 0;
  const layout = layoutTree();
  drawLinks(layout);
  renderNodes(layout);
  renderSelected();
  renderPeopleList();
  renderStats(layout);
  renderAccess();
}

function showError(error) {
  alert(error.message || error);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    assertCanEdit();
    const formData = new FormData(form);
    const person = makePerson(formData);
    if (!person.name) return;
    addRelative(person, formData.get("relationship"));
    form.reset();
    relationshipType.value = state.people.length ? "father" : "root";
    await persist();
    render();
  } catch (error) {
    showError(error);
  }
});

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    assertCanEdit();
    const formData = new FormData(editForm);
    if (!formData.get("name").trim()) return;
    updateSelectedPerson(formData);
    await persist();
    render();
  } catch (error) {
    showError(error);
  }
});

createTreeButton.addEventListener("click", async () => {
  try {
    const treeName = treeNameInput.value.trim() || "My family tree";
    const passcode = passcodeInput.value.trim();
    const created = await api.createTree(treeName, passcode);
    state.passcode = passcode;
    state.unlocked = true;
    applyTree(created.tree);
    await renderSavedTrees();
    render();
  } catch (error) {
    showError(error);
  }
});

unlockTreeButton.addEventListener("click", async () => {
  try {
    if (!state.treeId) throw new Error("Load a tree first.");
    const passcode = passcodeInput.value.trim();
    await api.verifyTree(state.treeId, passcode);
    state.passcode = passcode;
    state.unlocked = true;
    render();
  } catch (error) {
    showError(error);
  }
});

saveTreeButton.addEventListener("click", async () => {
  try {
    await persist();
    render();
  } catch (error) {
    showError(error);
  }
});

newTreeButton.addEventListener("click", () => {
  state.treeId = null;
  state.treeName = "My family tree";
  state.passcode = "";
  state.unlocked = false;
  state.people = [];
  state.parentLinks = [];
  state.partnerLinks = [];
  state.siblingLinks = [];
  state.selectedId = null;
  passcodeInput.value = "";
  render();
});

deleteTreeButton.addEventListener("click", async () => {
  try {
    assertCanEdit();
    const confirmed = confirm(`Delete "${state.treeName}" from the backend?`);
    if (!confirmed) return;
    await api.deleteTree(state.treeId, state.passcode);
    newTreeButton.click();
    await renderSavedTrees();
  } catch (error) {
    showError(error);
  }
});

deletePersonButton.addEventListener("click", async () => {
  try {
    assertCanEdit();
    const selected = getPerson(state.selectedId);
    if (!selected) return;
    const confirmed = confirm(`Delete ${selected.name} from this tree?`);
    if (!confirmed) return;
    deleteSelectedPerson();
    await persist();
    render();
  } catch (error) {
    showError(error);
  }
});

treeNameInput.addEventListener("input", () => {
  state.treeName = treeNameInput.value.trim() || "My family tree";
  renderStats(layoutTree());
});

searchInput.addEventListener("input", renderPeopleList);

exportButton.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(serializeTree(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(state.treeName || "family-tree").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "family-tree"}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

importFile.addEventListener("change", async () => {
  try {
    assertCanEdit();
    const [file] = importFile.files;
    if (!file) return;
    applyTree({ ...(JSON.parse(await file.text())), id: state.treeId });
    await persist();
    render();
  } catch (error) {
    showError(error);
  } finally {
    importFile.value = "";
  }
});

resetButton.addEventListener("click", async () => {
  try {
    assertCanEdit();
    const confirmed = confirm("Clear all people from this tree?");
    if (!confirmed) return;
    state.people = [];
    state.parentLinks = [];
    state.partnerLinks = [];
    state.siblingLinks = [];
    state.selectedId = null;
    await persist();
    render();
  } catch (error) {
    showError(error);
  }
});

render();
renderSavedTrees().catch(showError);
