const fs = require('node:fs/promises');
const path = require('node:path');
const { getLeaderboardData } = require('../server');

async function main() {
  const outputDir = path.join(__dirname, '..', 'public', 'data');
  await fs.mkdir(outputDir, { recursive: true });

  const [allPayload, clawhubPayload, skillsShPayload] = await Promise.all([
    getLeaderboardData({ source: 'all', topN: 96, maxPerSource: 48 }),
    getLeaderboardData({ source: 'clawhub', topN: 48, maxPerSource: 48 }),
    getLeaderboardData({ source: 'skillssh', topN: 48, maxPerSource: 48 }),
  ]);

  await Promise.all([
    fs.writeFile(path.join(outputDir, 'leaderboard.json'), JSON.stringify(allPayload, null, 2), 'utf8'),
    fs.writeFile(path.join(outputDir, 'clawhub.json'), JSON.stringify(clawhubPayload, null, 2), 'utf8'),
    fs.writeFile(path.join(outputDir, 'skillssh.json'), JSON.stringify(skillsShPayload, null, 2), 'utf8'),
  ]);

  console.log(`已导出综合榜 ${allPayload.items.length} 条 -> public/data/leaderboard.json`);
  console.log(`已导出 ClawHub 榜 ${clawhubPayload.items.length} 条 -> public/data/clawhub.json`);
  console.log(`已导出 Skills.sh 榜 ${skillsShPayload.items.length} 条 -> public/data/skillssh.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
