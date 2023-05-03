import jwt from 'jsonwebtoken'
import { Request, Response, NextFunction } from "express";
import fs from 'fs/promises';
import path from "path";
import appManager from '../appManager';

async function authenticateToken(req:Request, res:Response, next:NextFunction){
    var cert = await fs.readFile(path.join(__dirname, 'auth-ripley-cloud_certificate.pem')) // get public key

    console.log("----------", req.headers);
    const authHeader = req.headers['authorization']; // bearer token

    const token = authHeader && authHeader.split(' ')[1];
    //console.log("----------", token);
    if (token == null) {
        res.status(401).json({error:"Null Token"});
    }
    else{
        const decoded = jwt.verify(token, cert, (err:any, decode:any) => {
        if (err){
            console.log(err.message);
            res.status(403).json({error:err.message})
        }
        //req.user = user;
        next();
    })
    }
};


export {authenticateToken}