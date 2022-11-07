module.exports = run;

const core = require("@actions/core");
const { dirname } = require("path");
const { writeFileSync } = require("fs");
const makeDir = require("make-dir");

class RepoData {
  constructor(name, weeksSinceMainBranchMerge, weeksSinceDevBranchMerge) {
    this.name = name;
    this.weeksSinceMainBranchMerge = weeksSinceMainBranchMerge;
    this.weeksSinceDevBranchMerge = weeksSinceDevBranchMerge;
  }
}

async function run(octokit, { org,path, output }) {
  const query = `query ($org: String!, $after: String) {
    organization(login: $org) {
        repositories(first: 100, privacy: PUBLIC, after:$after) {
            totalCount
            pageInfo {
                endCursor
                hasNextPage
              }
            nodes {
                name
                isArchived
                refs(first: 100, refPrefix: "refs/heads/") {
                  nodes {
                    name
                    target {
                      ... on Commit {
                        committedDate
                      }
                    }
                  }
                } 
              }
        }
    }
  }`;

  process.stdout.write(`Requesting repo stats for ${org} `);
  const repoStats = [];
  let result;
  let filteredResults = [];
  do {
    result = await octokit.graphql(query, {
      org,
      after: result
        ? result.organization.repositories.pageInfo.endCursor
        : undefined,
    });
    repoStats.push(...result.organization.repositories.nodes);
    process.stdout.write(".");
  } while (result.organization.repositories.pageInfo.hasNextPage);
  process.stdout.write("\n");
  
  for(let i =0; i< repoStats.length; i++)
  {
    let mainBranches = repoStats[i].refs.nodes.filter(node => (isMainBranch(node)));
    let devBranches = repoStats[i].refs.nodes.filter(node => (isDevBranch(node)));

    let weeksSinceMainMerge, weeksSinceDevMerge = -1;
    
    if(mainBranches.length > 0) {
      weeksSinceMainMerge = numberOfWeeksBetweenDates(
        new Date(mainBranches[0].target.committedDate), 
        new Date());
    }

    if(devBranches.length > 0) {
      weeksSinceDevMerge = numberOfWeeksBetweenDates(
        new Date(devBranches[0].target.committedDate), 
        new Date());
    }

    filteredResults.push(new RepoData(repoStats[i].name, weeksSinceMainMerge, weeksSinceDevMerge));
  }
  const rows = [];
  let rowData = "repo name, weeks since main merge, weeks since dev merge";
  rows.push(rowData);
  for(let i = 0; i< filteredResults.length; i++) 
  {
    rowData =  filteredResults[i].name + "," + filteredResults[i].weeksSinceMainBranchMerge + "," + filteredResults[i].weeksSinceDevBranchMerge;
    rows.push(rowData);
  }
  

  await makeDir(dirname(path));
  writeFileSync(path, rows.join("\n"),{encoding:'utf8',flag:'w'});

  core.setOutput("data", JSON.stringify(filteredResults, null, 2) + "\n");
}

function isMainBranch(node)
{
  if(node.name == "master" || node.name == "main") return true;
  return false;
}

function isDevBranch(node)
{
  if(node.name == "develop" ||  node.name == "dev") return true;
  return false;
}

// Returns how many weeks have passed between two dates
//Reference: https://bobbyhadz.com/blog/javascript-get-number-of-weeks-between-two-dates
function numberOfWeeksBetweenDates(startDate, endDate)
{
  const msInWeek = 1000 * 60 * 60 * 24 * 7;
  return Math.round(Math.abs(endDate - startDate) / msInWeek);
}