import { App, Octokit } from "octokit";
import dotenv from 'dotenv';
import { env } from "./configuration";
import { createAppAuth } from '@octokit/auth-app';

dotenv.config();

const APPID=process.env.APPID || env.APPID
const PRIVATEKEY=process.env.PRIVATEKEY || env.PRIVATEKEY
const CLIENTID= process.env.CLIENTID || env.CLIENTID
const CLIENTSECRET= process.env.CLIENTSECRET || env.CLIENTSECRET
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || env.WEBHOOK_SECRET

interface Job {
    workflow_job: Object,
    repository: Object,
    id: number,
    url: string
}


export default class appManager {

    private _workflowQueued: Array<Job> = [];
    private _workflowInprogress: Array<Job> = [];
    private _computeService:string = 'https://compute-dev.classee.cloud/';
    private _database:string = 'https://db-dev.classee.cloud/';
    private _githubApp:App;
    private _installations: { orgName: string, id: number, octokit: Octokit }[] = [];

    constructor(){
        // -- define app and credentials
        this._githubApp = new App({
            appId: APPID,
            privateKey: PRIVATEKEY.replace(/\\n/gm, '\n'),
            oauth: {
                clientId: CLIENTID,
                clientSecret: CLIENTSECRET,
            },
            webhooks: {
                secret: WEBHOOK_SECRET,
            }
        });
        
        this.updateOcto();
    }

    private async updateOcto(){
        const installations = await this._githubApp.octokit.request('GET /app/installations');
        for (let installation of installations.data) {
            this._installations.push({
                orgName: installation.account?.login || '',
                id: installation.id,
                octokit: new Octokit({
                    authStrategy: createAppAuth,
                    auth: {
                        appId: APPID,
                        privateKey: PRIVATEKEY.replace(/\\n/gm, '\n'),
                        installationId: installation.id,
                    },
                })
            });
        }
    }

    public getApp(){
        return this._githubApp;
    }

    public getWorkflowQueued(){
        return this._workflowQueued;
    }

    public getWorkflowInprogress(){
        return this._workflowInprogress;
    }

    public getComputeService(){
        return this._computeService;
    }

    public getDatabase(){
        return this._database;
    }

    public async getRepos(app:App, loginName:string){
        var repos:{id: number, repo: any}[] = [];
        for await (const { installation } of this._githubApp.eachInstallation.iterator()) {
            //console.log(installation.id);
            for await (const { repository } of this._githubApp.eachRepository.iterator({
                installationId: installation.id,
            })) {
                    if((repository.owner.login == loginName))  {
                        const dict:{id: number, repo: any} = {
                            id: installation.id,
                            repo: repository
                        }
                        repos.push(dict);
                    }
                }
            }
        return repos;
    }

    public getOctokitInstance(orgName:string){
        var v:{ orgName: string, id: number, octokit: Octokit }[] = [];
        const x = this._installations.map((e) => {
            if (e.orgName == orgName){
                v.push({orgName:e.orgName, id:e.id, octokit:e.octokit});
            }            
        })
        return v;
    }

    
}