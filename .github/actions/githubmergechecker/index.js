module.exports = run;

const core = require("@actions/core");

async function run(octokit, { org, output }) {
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
    //process.stdout.write(`Looping through stats: ${JSON.stringify(repoStats[i].refs)}\n`);
    let filteredResults = repoStats[i].refs.nodes.filter(node => (validBranch(node)));
    process.stdout.write(`filteredResults: ${JSON.stringify(filteredResults)}\n`);
    for(let j=0; j< filteredResults.length; j++)
    {
      filteredResults[j].timeSinceMerge = numberOfWeeksBetweenDates(
                                                    new Date(filteredResults[j].target.committedDate), 
                                                    new Date());
    }

    repoStats[i].refs.nodes = filteredResults;
  }


  core.setOutput("data", JSON.stringify(filteredResults, null, 2) + "\n");
}

// A branch that is either some variant of "main" or "develop", ignores other branches
function validBranch(node)
{
  if(node.name == "develop" ||node.name == "master" ||  node.name == "dev" || node.name == "main") return true;
  return false;
}

// Returns how many weeks have passed between two dates
//Reference: https://bobbyhadz.com/blog/javascript-get-number-of-weeks-between-two-dates
function numberOfWeeksBetweenDates(startDate, endDate)
{
  const msInWeek = 1000 * 60 * 60 * 24 * 7;
  return Math.round(Math.abs(endDate - startDate) / msInWeek);
}