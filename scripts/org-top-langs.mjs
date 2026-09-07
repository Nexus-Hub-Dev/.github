// Gera profile/top-langs.svg somando os bytes de código por linguagem
// de TODOS os repositórios (não arquivados) da organização.
//
// Uso: ORG=<org> GH_TOKEN=<token> node scripts/org-top-langs.mjs

const ORG = process.env.ORG;
const TOKEN = process.env.GH_TOKEN;
const API = "https://api.github.com";
const TOP_N = 8;

if (!ORG || !TOKEN) {
  console.error("Faltam variáveis de ambiente ORG e/ou GH_TOKEN.");
  process.exit(1);
}

async function gh(path) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha em ${path} -> ${res.status}: ${body}`);
  }
  return res.json();
}

async function listRepos() {
  const repos = [];
  let page = 1;
  while (true) {
    const data = await gh(`/orgs/${ORG}/repos?per_page=100&page=${page}`);
    if (!data || data.length === 0) break;
    repos.push(...data.filter((r) => !r.archived));
    page++;
  }
  return repos;
}

// Cores oficiais aproximadas do GitHub Linguist (fallback cinza se não mapeada)
const COLORS = {
  Java: "#b07219",
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Python: "#3572A5",
  Shell: "#89e051",
  Dockerfile: "#384d54",
  PLpgSQL: "#336790",
  Mustache: "#724b3b",
  FreeMarker: "#0050b2",
};
const FALLBACK = "#8b949e";

function renderSvg(entries, totalBytes) {
  const width = 480;
  const barHeight = 10;
  const rowGap = 26;
  const padding = 20;
  const labelWidth = 110; // espaço reservado pro nome da linguagem
  const pctWidth = 48;    // espaço reservado pra porcentagem, fora da barra
  const trackX = padding + labelWidth;
  const trackWidth = width - padding * 2 - labelWidth - pctWidth;
  const height = padding * 2 + entries.length * rowGap;

  let rows = "";
  entries.forEach(([lang, bytes], i) => {
    const pct = ((bytes / totalBytes) * 100).toFixed(1);
    const barWidth = Math.max(2, (bytes / entries[0][1]) * trackWidth);
    const y = padding + i * rowGap;
    const color = COLORS[lang] || FALLBACK;
    rows += `
    <text x="${padding}" y="${y + barHeight}" font-family="Segoe UI, Ubuntu, sans-serif" font-size="13" fill="#c9d1d9">${lang}</text>
    <rect x="${trackX}" y="${y}" width="${trackWidth}" height="${barHeight}" rx="4" fill="#21262d"/>
    <rect x="${trackX}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="${color}"/>
    <text x="${width - padding}" y="${y + barHeight}" font-family="Segoe UI, Ubuntu, sans-serif" font-size="12" fill="#8b949e" text-anchor="end">${pct}%</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Linguagens mais usadas na organizacao">
  <rect width="100%" height="100%" rx="8" fill="transparent"/>
  ${rows}
</svg>
`;
}

async function main() {
  console.log(`Listando repositórios de ${ORG}...`);
  const repos = await listRepos();
  console.log(`Encontrados ${repos.length} repositórios (não arquivados).`);

  const totals = new Map();

  for (const repo of repos) {
    const langs = await gh(`/repos/${ORG}/${repo.name}/languages`);
    if (!langs) {
      console.log(`  ${repo.name}: sem dados de linguagem (repo vazio?)`);
      continue;
    }
    const entries = Object.entries(langs);
    console.log(`  ${repo.name}: ${entries.map(([l]) => l).join(", ") || "(vazio)"}`);
    for (const [lang, bytes] of entries) {
      totals.set(lang, (totals.get(lang) || 0) + bytes);
    }
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_N);
  const totalBytes = sorted.reduce((sum, [, bytes]) => sum + bytes, 0);

  if (sorted.length === 0) {
    console.warn("Nenhuma linguagem encontrada em nenhum repositório.");
  }

  const svg = renderSvg(
    sorted.length ? sorted : [["Sem dados", 1]],
    totalBytes || 1
  );

  const fs = await import("node:fs/promises");
  await fs.mkdir("profile", { recursive: true });
  await fs.writeFile("profile/top-langs.svg", svg);
  console.log("✅ SVG gerado em profile/top-langs.svg");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
