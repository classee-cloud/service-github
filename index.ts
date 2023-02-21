import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import {Octokit, App, createNodeMiddleware } from "octokit";
import { env } from "./configuration";
import cors from "cors";
import { createServer } from "node:http";

dotenv.config();

interface Job {
    workflow_job: Object,
    repository: Object,
    id: number
}
var workflowQueued: Array<Job> = []
var workflowInprogress: Array<Job> = []
var computeService:string = "http://localhost:8282"

// -- define app and credentials
const githubApp:App = new App({
    appId: env.APPID,
    privateKey: env.PRIVATEKEY.replace(/\\n/gm, '\n'),
    oauth: {
        clientId: env.CLIENTID,
        clientSecret: env.CLIENTID,
    },
    webhooks: {
        secret: env.WEBHOOK_SECRET,
    },
});

async function getRepos(app:App, loginName:string){
    var repos = [];
    for await (const { installation } of githubApp.eachInstallation.iterator()) {
        //console.log(installation.id);
        for await (const { repository } of githubApp.eachRepository.iterator({
            installationId: installation.id,
        })) {
                if((repository.owner.login == loginName))  {
                    const dict = {
                        id: installation.id,
                        repo: repository
                    }
                    repos.push(dict);
                }
            }
        }
    return repos;
}

githubApp.webhooks.on("workflow_job.queued", async (event) => {
    console.log("Job Queued with ID: ", event.payload.workflow_job.id);
    workflowQueued.push({"id":event.payload.workflow_job.id, "workflow_job":event.payload.workflow_job, "repository": event.payload.repository});
    console.log(workflowQueued.length);
    
    // generate the JWT token for runner 
    const jwtToken = "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";
      
    // call API to compute service
    const requestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id:event.payload.workflow_job.id,
                               workflow_job:event.payload.workflow_job,
                                org_name: event.payload.sender.login,
                                repository:event.payload.repository,
                                token:jwtToken
                            })
        };
    const response = await fetch(computeService+'/runner', requestOptions);
    //console.log(response);
    console.log("Runner started");
  });

githubApp.webhooks.on("workflow_job.in_progress", async (event) => {
    console.log("Job Inprogress with ID: ", event.payload.workflow_job.id);

    // remove from queued
    let temp:Array<Job> = []
    for (let i=0; i<workflowQueued.length; i++ ){
        if(workflowQueued[i].id != event.payload.workflow_job.id){
            temp.push(workflowQueued[i]);
        }
    }
    workflowQueued = temp;

    // push to inprogress
    workflowInprogress.push({"id":event.payload.workflow_job.id, "workflow_job":event.payload.workflow_job, "repository": event.payload.repository});
    console.log(workflowQueued.length);
    console.log(workflowInprogress.length);
});

githubApp.webhooks.on("workflow_job.completed", async (event) => {
    console.log("Job completed with ID: ", event.payload.workflow_job.id);

    // remove from in progress
    let temp:Array<Job> = []
    for (let i=0; i<workflowInprogress.length; i++ ){
        if(workflowInprogress[i].id != event.payload.workflow_job.id){
            temp.push(workflowInprogress[i]);
        }
    }
    workflowInprogress = temp;
    console.log(workflowInprogress.length);
});


// ------------------------------------------------------
const app: Express  = express();
app.use(createNodeMiddleware(githubApp));
app.use(cors());
const PORT = process.env.PORT || 8181;

app.get("/", async (req: Request, res: Response)=>{
    res.send("Home");
});

app.get('/repodetails/:loginName', async (req: Request, res: Response)=>{
    // user data and key -- get from req body
   //const appID = 33364735;
   const loginName = req.params.loginName;
   
   // get all repo data for given loginName or appID
   var repos = await getRepos(githubApp, loginName);
   
   var repoData:Array<any> = []
   repos.map(r => {
       var data = {
           "id": r.repo.id,
           "name":r.repo.name,
           "link":r.repo.html_url,
       }
       repoData.push(data);
   })

   const value = await githubApp.octokit.request('GET /app', {})
   console.log(value);

   res.status(200);
   res.send(repoData)
});



app.listen(PORT, () =>{
    console.log("Server is Successfully Running, and App is listening on port "+ PORT)
});
