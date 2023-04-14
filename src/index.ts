import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import {Octokit, App, createNodeMiddleware } from "octokit";
import cors from "cors";
import appClass from './src/appManager';
import { authenticateToken } from './src/middleware/authenticateToken';
//import { Console } from 'console';
import jwt from 'jsonwebtoken'
import fs from 'fs/promises';
import path from "path";
import axios from 'axios';

dotenv.config();

interface Job {
    workflow_job: Object,
    repository: Object,
    id: number,
    url: string
}

interface JwtPayload {
    org: string;
    reponame: string;
    iat: number;
    exp: number;
  }

const appManager = new appClass();
const githubApp:App = appManager.getApp();
var workflowQueued = appManager.getWorkflowQueued();
var workflowInprogress = appManager.getWorkflowInprogress();
const computeService = appManager.getComputeService();
const database = appManager.getDatabase();
const tokenExpiresIn = process.env.TOKENLIFE || "1h"


githubApp.webhooks.on("workflow_job.queued", async (event) => {
    console.log("Job Queued with ID: ", event.payload.workflow_job.id);
    workflowQueued.push({"id":event.payload.workflow_job.id, 
                        "workflow_job":event.payload.workflow_job, 
                        "repository": event.payload.repository,
                        "url": event.payload.repository.html_url});
    console.log(workflowQueued.length);

    // update repo to queued
    requestOptions = {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
                status: "queued"
            })
        };

    var response = await fetch(database+`/api/config_repos/${event.payload.repository.name}`, requestOptions);

    // call API to compute service
    // generate token based on org name and repository
    const secretKey = await fs.readFile(path.join(__dirname, 'src/middleware/custom-token.pem')) 
    const repoName = event.payload.repository.html_url.split("/").at(-1);
    const accessToken = jwt.sign(
            {org: event.payload.sender.login,
             reponame: repoName},
             secretKey,
            {expiresIn: tokenExpiresIn}
    )
    //console.log(accessToken);

    // store in map
    appManager.setAccessTokens(event.payload.sender.login + " " + repoName, accessToken);
    //console.log("-------", accessToken,appManager.getAccessTokens());

    // send the token along with body
    var requestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id:event.payload.workflow_job.id,
                               workflow_job:event.payload.workflow_job,
                                org_name: event.payload.sender.login,
                                repository:event.payload.repository,
                                authorization: accessToken,
                            })
        };
    
    response = await fetch(computeService+'/runner', requestOptions);
    /*response = await axios.post(computeService+'/runner', 
        { id:event.payload.workflow_job.id,
            workflow_job:event.payload.workflow_job,
            org_name: event.payload.sender.login,
            repository:event.payload.repository,
            authorization: accessToken,
         });
    */
    

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

    // update repo to inprogress
    const requestOptions = {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
                status: "in progress"
            })
        };
    const response = await fetch(database+`/api/config_repos/${event.payload.repository.name}`, requestOptions);

    // push to inprogress
    workflowInprogress.push({"id":event.payload.workflow_job.id, 
                        "workflow_job":event.payload.workflow_job, 
                        "repository": event.payload.repository,
                        "url": event.payload.repository.html_url});
    console.log(workflowQueued.length);
    console.log(workflowInprogress.length);
});

githubApp.webhooks.on("workflow_job.completed", async (event) => {
    console.log("Job completed with ID: ", event.payload.workflow_job.id);

    const requestOptions = {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
                status: "not started/completed"
            })
        };
    const response = await fetch(database+`/api/config_repos/${event.payload.repository.name}`, requestOptions);

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

app.get("/", authenticateToken, async (req: Request, res: Response)=>{
    
    //const token = await githubApp.octokit.request('POST /orgs/{org}/actions/runners/registration-token', {
    //    org: 'rajatkeshri'
    //  })
    // await console.log(token);
    res.send("Home");
});

app.get('/repodetails/:loginName', authenticateToken, async (req: Request, res: Response)=>{
   const loginName = req.params.loginName;
   
   // get all repo data for given loginName or appID
   var repos = await appManager.getRepos(githubApp, loginName);
   
   var repoData:Array<any> = []
   repos.map(r => {
       var data = {
           "id": r.repo.id,
           "name":r.repo.name,
           "link":r.repo.html_url,
           "org":loginName
       }
       repoData.push(data);
   })

   res.status(200);
   res.send(repoData)
});


app.get('/runnertoken/:org/:reponame/:accesstoken',  async (req:Request, res:Response) => {
    //const ORG = req.params.org;
    //const REPONAME = req.params.reponame;

    // get the token
    const token = req.params.accesstoken;

    // decode the token, extract org and reponame
    const secretKey = await fs.readFile(path.join(__dirname, 'src/middleware/custom-token.pem')) 
    const decoded:JwtPayload =  <JwtPayload> jwt.verify(token, secretKey);
    const ORG = decoded.org
    const REPONAME = decoded.reponame;

    // check if access token is correct
    const tokenMap = appManager.getAccessTokens()
    if (tokenMap[ORG+" "+REPONAME] == req.params.accesstoken){
        console.log("token validated")
        
        // initalize octokit
        const instance = appManager.getOctokitInstance(ORG);
        var octo:any = null;
        var installationID: number = 0;
        if (instance.length != 0){
            installationID = instance[0].id;
            octo = instance[0].octokit;
        }

        // get access token for octo
        //const { token } = await octo.data ({ installationId: installationID, permissions: { admin: "org" } });
        const { data: { token } } = await octo.request("POST /app/installations/{installation_id}/access_tokens", {
            installation_id: installationID,
            permissions: {
            administration: "write",
            },
        });
        
        // get token for runner based on org and reponame
        await octo.request('POST /repos/{owner}/{repo}/actions/runners/registration-token', {
            owner: ORG,
            repo: REPONAME,
            headers: {
                'X-GitHub-Api-Version': '2022-11-28',
                authorization: `token  ${token}`,
                accept: "application/vnd.github.machine-man-preview+json",
            }
        })
            .then((response: any) => {
                //console.log(response);
                // return the token
                res.send({"token":response.data.token});
            })
            .catch((err:any) => {
                console.log(err);
            });
    }
    else{
        res.send({"token":null});
    }

    
})

app.listen(PORT, () =>{
    console.log("Server is Successfully Running, and App is listening on port "+ PORT)
});
