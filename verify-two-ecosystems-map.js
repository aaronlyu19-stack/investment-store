const fs = require("fs");
const path = require("path");
const vm = require("vm");

const pagePath = path.join(__dirname, "ai-two-ecosystems", "index.html");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(fs.existsSync(pagePath), "Missing ai-two-ecosystems/index.html");

const html = fs.readFileSync(pagePath, "utf8");
const dataMatch = html.match(/window\.MAP_DATA\s*=\s*(\{[\s\S]*?\n\});/);
assert(dataMatch, "Missing window.MAP_DATA object");

const sandbox = {};
vm.runInNewContext(`data = ${dataMatch[1]}`, sandbox);
const data = sandbox.data;

assert(Array.isArray(data.layers), "MAP_DATA.layers must be an array");
assert(Array.isArray(data.nodes), "MAP_DATA.nodes must be an array");
assert(Array.isArray(data.edges), "MAP_DATA.edges must be an array");
assert(data.nodes.length >= 22, "Expected at least 22 ecosystem and chokepoint nodes");

const layerIds = new Set(data.layers.map((layer) => layer.id));
const requiredLayerIds = [
  "models",
  "cloud",
  "compute",
  "network",
  "manufacturing",
  "infrastructure",
  "applications",
];
for (const id of requiredLayerIds) {
  assert(layerIds.has(id), `Missing layer ${id}`);
}

const seen = new Set();
const nodesById = new Map();
const requiredFields = [
  "ecosystem",
  "layer",
  "title",
  "representatives",
  "description",
  "investmentMeaning",
  "risks",
];

for (const node of data.nodes) {
  assert(node.id, "Every node needs an id");
  assert(!seen.has(node.id), `Duplicate node id ${node.id}`);
  seen.add(node.id);
  nodesById.set(node.id, node);

  for (const field of requiredFields) {
    assert(node[field], `Node ${node.id} missing ${field}`);
  }
  assert(layerIds.has(node.layer), `Node ${node.id} uses unknown layer ${node.layer}`);
  assert(
    ["us_allies", "china", "shared"].includes(node.ecosystem),
    `Node ${node.id} has invalid ecosystem ${node.ecosystem}`
  );
  assert(
    Array.isArray(node.representatives) && node.representatives.length > 0,
    `Node ${node.id} needs representatives`
  );
}

for (const ecosystem of ["us_allies", "china"]) {
  for (const layer of requiredLayerIds) {
    assert(
      data.nodes.some((node) => node.ecosystem === ecosystem && node.layer === layer),
      `Missing ${ecosystem} node for layer ${layer}`
    );
  }
}

const sharedNodes = data.nodes.filter((node) => node.ecosystem === "shared");
assert(sharedNodes.length >= 8, "Expected at least 8 shared chokepoint nodes");
assert(
  sharedNodes.every((node) => node.sharedDependency || node.bottleneck),
  "Shared nodes must be marked as dependencies or bottlenecks"
);
for (const node of sharedNodes) {
  assert(
    Array.isArray(node.usRepresentatives) && node.usRepresentatives.length > 0,
    `Shared node ${node.id} needs usRepresentatives`
  );
  assert(
    Array.isArray(node.chinaRepresentatives) && node.chinaRepresentatives.length > 0,
    `Shared node ${node.id} needs chinaRepresentatives`
  );
}
const sharedPower = nodesById.get("shared_power");
assert(sharedPower, "Missing shared_power node");
assert(
  sharedPower.chinaRepresentatives.some((item) => item.includes("国家电网")),
  "State Grid should be listed only on the China side"
);
assert(
  !sharedPower.usRepresentatives.some((item) => item.includes("国家电网")),
  "State Grid must not appear in the US/allies side"
);

for (const edge of data.edges) {
  assert(nodesById.has(edge.source), `Edge source ${edge.source} does not exist`);
  assert(nodesById.has(edge.target), `Edge target ${edge.target} does not exist`);
}

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
assert(scripts.length > 0, "Expected an inline script");
for (const script of scripts) {
  new Function(script);
}

for (const marker of [
  "let selectedId",
  "let hoverId",
  "function activeId()",
  "function drawLines",
  "function applyFocus",
  "showDetails(node)",
  "function compareText(node)",
  "function representativesForCard(node)",
  "function renderRepresentatives(node)",
  "drawer-open",
  "selectedId === node.id ? null : node.id",
  "drawLines(activeId())",
]) {
  assert(html.includes(marker), `Missing interaction marker: ${marker}`);
}

for (const text of [
  "美国及盟友 AI 体系",
  "共享依赖 / 卡点 / 交叉耦合层",
  "中国 AI 体系",
  "悬停预览，点击锁定；再次点击取消",
  "中美体系对比",
]) {
  assert(html.includes(text), `Missing visible text: ${text}`);
}

assert(
  !html.includes("核心不是公司国籍对比，而是两套 AI stack 如何组织模型、云、芯片、制造、网络、电力和应用"),
  "Header still contains the long explanatory copy"
);
assert(!html.includes("showDetails(null);"), "Details drawer should stay closed before a node is clicked");
assert(html.includes(".details.drawer-open"), "Missing explicit open state for details drawer");
assert(html.includes("grid-template-rows:40px 340px 560px 400px"), "Lane heights are still too tight");
assert(html.includes("min-height:168px"), "Cards need more vertical room");
assert(html.includes("美国及盟友侧"), "Shared details should separate US/allies representatives");
assert(html.includes("中国体系侧"), "Shared details should separate China representatives");

console.log(
  `two-ecosystems map verified: ${data.nodes.length} nodes, ${data.edges.length} edges`
);
