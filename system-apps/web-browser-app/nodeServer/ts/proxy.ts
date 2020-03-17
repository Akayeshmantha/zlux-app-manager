/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html
  
  SPDX-License-Identifier: EPL-2.0
  
  Copyright Contributors to the Zowe Project.
*/
import { Response, Request } from "express";
import { Router } from "express-serve-static-core";
import httpProxy from 'http-proxy';
import express from 'express';
import Promise from 'bluebird';
import http from "http";
import fs from 'fs';

class ProxyDataService {
  private context: any;
  private router: Router = express.Router();
  private lastPort = 6565;
  private proxyServerByPort = new Map<number, httpProxy>();

  constructor(context: any) {
    this.context = context;
    context.addBodyParseMiddleware(this.router);
    this.router.post('/', (req: Request, res: Response) => this.handleNewProxyServerRequest(req, res));
    this.router.delete('/', (req: Request, res: Response) => this.handleDeleteProxyServerRequest(req, res));
  }

  private handleNewProxyServerRequest(req: Request, res: Response) {
    const url = req.body.url;
    this.context.logger.info(`proxy got post request for url=${url}`);
    const port = this.lastPort;
    this.lastPort++;
    const proxyServer = this.startProxyServer(url, port);
    this.proxyServerByPort.set(port, proxyServer);
    this.context.logger.info(`created proxy for ${url} on port ${port}`);
    res.status(200).json({ port });
  }

  private handleDeleteProxyServerRequest(req: Request, res: Response) {
    const port = +req.query.port;
    this.context.logger.info(`proxy got delete request for port=${port}`);
    const proxyServer = this.proxyServerByPort.get(port);
    if (proxyServer) {
      proxyServer.close();
    }
    res.status(204).send();
  }

  private makeProxyOptions(url: string): httpProxy.ServerOptions {
    const baseOptions: httpProxy.ServerOptions = {
      target: 'dummy target',
      secure: false,
      changeOrigin: true,
      autoRewrite: true,
      timeout: 0,
      ws: true,
      ssl: {
        key: fs.readFileSync('../defaults/serverConfig/zlux.keystore.key', 'utf8'),
        cert: fs.readFileSync('../defaults/serverConfig/zlux.keystore.cer', 'utf8')
      },
    };
    return <httpProxy.ServerOptions>{
      ...baseOptions,
      target: url,
    };
  }

  private startProxyServer(url: string, port: number): httpProxy {
    this.context.logger.info(`about to create proxy for ${url}`);
    const proxyOptions = this.makeProxyOptions(url);
    const proxy = httpProxy.createProxyServer(proxyOptions);
    proxy.on('proxyRes', (proxyRes: http.IncomingMessage, req: http.IncomingMessage, res: http.ServerResponse) => this.handleProxyRes(proxyRes, req, res));
    proxy.on('error', (err: Error, req: http.IncomingMessage, res: http.ServerResponse) => this.handleProxyError(err, req, res));
    proxy.on('econnreset', (err: Error, req: http.IncomingMessage, res: http.ServerResponse) => this.handleProxyEconnreset(err, req, res));
    return proxy.listen(port);
  }

  private handleProxyRes(proxyRes: http.IncomingMessage, req: http.IncomingMessage, res: http.ServerResponse) {
    proxyRes.headers['x-frame-options'] = 'allowall';
    this.context.logger.info('Modified Response headers from target', JSON.stringify(proxyRes.headers, null, 2));
  }

  private handleProxyError(err: Error, req: http.IncomingMessage, res: http.ServerResponse) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Something went wrong: ${JSON.stringify(err, null, 2)}`);
  }

  private handleProxyEconnreset(err: Error, req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Connection reset: ${JSON.stringify(err, null, 2)}`);
  }

  getRouter(): Router {
    return this.router;
  }
}

exports.proxyRouter = function (context: any): Router {
  return new Promise(function (resolve, reject) {
    const dataService = new ProxyDataService(context);
    resolve(dataService.getRouter());
  });
}


/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html

  SPDX-License-Identifier: EPL-2.0

  Copyright Contributors to the Zowe Project.
*/

