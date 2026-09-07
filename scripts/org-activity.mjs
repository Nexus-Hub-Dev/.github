// Gera profile/org-activity.svg agregando a atividade de commits
// de TODOS os repositórios (não arquivados) da organização.
//
// Uso: ORG=<org> GH_TOKEN=<token> node scripts/org-activity.mjs

const ORG = process.env.ORG;
const TOKEN = process.env.GH_TOKEN;
const API = "https://api.github.com";

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
  if (res.status === 202) return null; // stats ainda sendo calculadas pelo GitHub
  if (res.status === 404) return null; // repo vazio ou sem stats
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

// GitHub calcula essas estatísticas de forma assíncrona.
// Na primeira chamada pode devolver 202 (processando) — por isso o retry.
async function commitActivity(repoName, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const data = await gh(`/repos/${ORG}/${repoName}/stats/commit_activity`);
    if (data) return data;
    await new Promise((r) => setTimeout(r, 2500));
  }
  console.warn(`  (sem stats disponíveis para ${repoName}, ignorando)`);
  return [];
}

function renderSvg(weeks) {
  const cell = 11;
  const gap = 3;
  const padding = 12;
  const w = weeks.length * (cell + gap) + padding * 2;
  const h = 7 * (cell + gap) + padding * 2;
  const max = Math.max(1, ...weeks.flatMap((wk) => wk.days));
  const totalCommits = weeks.reduce(
    (sum, wk) => sum + wk.days.reduce((a, b) => a + b, 0),
    0
  );

  const palette = ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"];
  const colorFor = (v) => {
    if (v === 0) return palette[0];
    const level = Math.min(4, Math.ceil((v / max) * 4));
    return palette[level];
  };

  let rects = "";
  weeks.forEach((wk, x) => {
    wk.days.forEach((v, y) => {
      const cx = padding + x * (cell + gap);
      const cy = padding + y * (cell + gap);
      rects += `<rect x="${cx}" y="${cy}" width="${cell}" height="${cell}" rx="2" ry="2" fill="${colorFor(
        v
      )}"><title>${v} commit(s)</title></rect>\n`;
    });
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Atividade agregada de ${totalCommits} commits em todos os repositorios da organizacao">
  <rect width="100%" height="100%" fill="transparent"/>
  ${rects}
</svg>
`;
}

async function main() {
  console.log(`Listando repositórios de ${ORG}...`);
  const repos = await listRepos();
  console.log(`Encontrados ${repos.length} repositórios (não arquivados).`);

  // weeksMap: timestamp (início da semana) -> [dom, seg, ter, qua, qui, sex, sab]
  const weeksMap = new Map();

  for (const repo of repos) {
    console.log(`Lendo atividade de ${repo.name}...`);
    const activity = await commitActivity(repo.name);
    for (const wk of activity) {
      const acc = weeksMap.get(wk.week) || [0, 0, 0, 0, 0, 0, 0];
      wk.days.forEach((d, i) => (acc[i] += d));
      weeksMap.set(wk.week, acc);
    }
  }

  const weeks = [...weeksMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, days]) => ({ week, days }));

  if (weeks.length === 0) {
    console.warn(
      "Nenhum dado de atividade encontrado. Gerando SVG vazio para não quebrar o README."
    );
  }

  const svg = renderSvg(weeks.length ? weeks : [{ week: 0, days: [0,0,0,0,0,0,0] }]);

  const fs = await import("node:fs/promises");
  await fs.mkdir("profile", { recursive: true });
  await fs.writeFile("profile/org-activity.svg", svg);
  console.log("✅ SVG gerado em profile/org-activity.svg");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
