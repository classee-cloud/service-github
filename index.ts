import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import {Octokit, App } from "Octokit";
import { env } from "./configuration";
import cors from "cors";

dotenv.config();

const app: Express  = express();
app.use(cors())
const PORT = process.env.PORT || 8181;

// -- define app and credentials
const githubApp:App = new App({
    appId: env.APPID,
    privateKey: env.PRIVATEKEY.replace(/\\n/gm, '\n'),
    oauth: {
        clientId: env.CLIENTID,
        clientSecret: env.CLIENTID,
    },
});

async function getRepos(app:App, id:number, loginName:string){
    var repos = [];
    for await (const { installation } of githubApp.eachInstallation.iterator()) {
        //console.log(installation.id);
        for await (const { repository } of githubApp.eachRepository.iterator({
            installationId: installation.id,
        })) {
                if((repository.owner.login == loginName) || (id == installation.id))  {
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


app.get('/repodetails/:loginName', async (req: Request, res: Response)=>{
    // user data and key -- get from req body
   const appID = 33364735;
   const loginName = req.params.loginName;
   
   // get all repo data for given loginName or appID
   var repos = await getRepos(githubApp, appID, loginName);
   
   var repoData:Array<any> = []
   repos.map(r => {
       var data = {
           "id": r.repo.id,
           "name":r.repo.name,
           "link":r.repo.html_url,
       }
       repoData.push(data);
   })
   res.status(200);
   res.send(repoData)
});

app.listen(PORT, () =>{
    console.log("Server is Successfully Running, and App is listening on port "+ PORT)
});
