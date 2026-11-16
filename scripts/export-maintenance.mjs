import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {mergeMaintenanceFeed} from '../src/worker.js';

// Only public notice fields are exported. The Actions token never leaves GitHub.
export async function exportMaintenance({token, request=fetch, now=Date.now()}={}) {
  const incidents=[];
  for(let page=1;page<=100;page++) {
    const headers={Accept:'application/vnd.github+json','User-Agent':'GaisenNOW-Status-Notices','X-GitHub-Api-Version':'2022-11-28'};
    if(token)headers.Authorization='Bearer '+token;
    const response=await request('https://api.github.com/repos/yuseicm0721/gaisen-status/issues?state=all&labels=maintenance&per_page=100&page='+page,{headers,redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('Maintenance export HTTP '+response.status);
    const issues=await response.json();
    if(!Array.isArray(issues))throw new Error('Invalid maintenance export response');
    for(const i of issues.filter(i=>!i.pull_request))incidents.push({id:i.number,source:'upptime',type:'maintenance',services:['ガイセンNOW'],title:i.title,state:i.state,startedAt:i.created_at,resolvedAt:i.closed_at,url:i.html_url});
    if(issues.length<100) {
      const feed={version:1,generatedAt:new Date(now).toISOString(),incidents};
      mergeMaintenanceFeed({incidents:[]},feed,now);
      return feed;
    }
  }
  throw new Error('Maintenance export pagination limit exceeded');
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const feed=await exportMaintenance({token:process.env.GH_TOKEN});
  await writeFile('maintenance.json',JSON.stringify(feed,null,2)+'\n');
  console.log('Published '+feed.incidents.length+' maintenance notices at '+feed.generatedAt);
}
