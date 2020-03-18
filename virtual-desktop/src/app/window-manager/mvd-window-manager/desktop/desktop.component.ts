

/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html

  SPDX-License-Identifier: EPL-2.0

  Copyright Contributors to the Zowe Project.
*/

import { Component, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ContextMenuItem } from 'pluginlib/inject-resources';
import { WindowManagerService } from '../shared/window-manager.service';
import { BaseLogger } from 'virtual-desktop-logger';

@Component({
  selector: 'rs-com-mvd-desktop',
  templateUrl: 'desktop.component.html'
})
export class DesktopComponent implements MVDHosting.LoginActionInterface {
  contextMenuDef: {xPos: number, yPos: number, items: ContextMenuItem[]} | null;
  private authenticationManager: MVDHosting.AuthenticationManagerInterface;
  public isPersonalizationPanelVisible: boolean;
  private readonly log: ZLUX.ComponentLogger = BaseLogger;
  private _theme: DesktopTheme = {
    color: {
      windowTextActive: '#171616',
      windowTextInactive: '#171616',
      windowColorActive: '#659ff9',
      windowColorInactive: '#659ff9',
      launchbarText: '#eeeeee',
      launchbarColor: '#557999',
      launchbarMenuText: '#212529',
      launchbarMenuColor: '#dde8f1'
    },
    size: {
      window: 2,
      launchbar: 2,
      launchbarMenu: 2
    }
  }
  
  constructor(
    public windowManager: WindowManagerService,
    private http: HttpClient,
    private injector: Injector
  ) {
    // Workaround for AoT problem with namespaces (see angular/angular#15613)
    this.authenticationManager = this.injector.get(MVDHosting.Tokens.AuthenticationManagerToken);
    this.contextMenuDef = null;
    this.authenticationManager.registerPostLoginAction(new AppDispatcherLoader(this.http));
    this.authenticationManager.registerPostLoginAction(this);
  }
  ngOnInit(): void {
    this.windowManager.contextMenuRequested.subscribe(menuDef => {
      this.contextMenuDef = menuDef;
    });
  }

  onLogin(username:string, plugins: ZLUX.Plugin[]): boolean {
    this.http.get(ZoweZLUX.uriBroker.pluginConfigUri(ZoweZLUX.pluginManager.getDesktopPlugin(), 'ui/theme', 'config.json')).subscribe((data: any) => {
      if (data) {
        this.log.info('Desktop config=',data.contents);
        this._theme = (data.contents as DesktopTheme);
      } else {
        this.log.info('No Desktop config found. Using defaults.');
      }
    });
    return true;
  }

  setTheme(newTheme: DesktopTheme) {
    this.log.info('Req to change to=',newTheme);
    this._theme = Object.assign({},newTheme);
    this.http.put<DesktopTheme>(ZoweZLUX.uriBroker.pluginConfigUri(ZoweZLUX.pluginManager.getDesktopPlugin(), 'ui/theme', 'config.json'), this._theme).subscribe((data: any) => { this.log.info(`Theme saved.`) });
  }
  getTheme() {
    return this._theme;
  }

  showPersonalizationPanel(): void {
    this.isPersonalizationPanelVisible = true;
  }

  hidePersonalizationPanel(): void {
    this.isPersonalizationPanelVisible = false;
  }

  personalizationPanelToggle(): void {
    if (this.isPersonalizationPanelVisible)
    {
      this.isPersonalizationPanelVisible = false;
    } else {
      this.isPersonalizationPanelVisible = true;
    }
  }

  closeContextMenu(): void {
    this.contextMenuDef = null;
  }
}

export type DesktopTheme = {
  color: {
    windowTextActive: string;
    windowTextInactive: string;
    windowColorActive: string;
    windowColorInactive: string;
    launchbarText: string;
    launchbarColor: string;
    launchbarMenuColor: string;
    launchbarMenuText: string;
  }
  size: {
    window: number;
    launchbar: number;
    launchbarMenu: number;
  }
}

class AppDispatcherLoader implements MVDHosting.LoginActionInterface {
  private readonly log: ZLUX.ComponentLogger = BaseLogger;
  constructor(private http: HttpClient) { }

  onLogin(username:string, plugins:ZLUX.Plugin[]):boolean {
    let desktop:ZLUX.Plugin = ZoweZLUX.pluginManager.getDesktopPlugin();
    let recognizersUri = ZoweZLUX.uriBroker.pluginConfigUri(desktop,'recognizers');
    let actionsUri = ZoweZLUX.uriBroker.pluginConfigUri(desktop,'actions');
    this.log.debug("ZWED5309I", recognizersUri, actionsUri); //this.log.debug(`Getting recognizers from "${recognizersUri}", actions from "${actionsUri}"`);
    this.http.get(recognizersUri).subscribe((config: any)=> {
      if (config) {
        let appContents = config.contents;
        let appsWithRecognizers:string[] = [];
        plugins.forEach((plugin:ZLUX.Plugin)=> {
          let id = plugin.getIdentifier();
          if (appContents[id]) {
            appsWithRecognizers.push(id);
          }
        });
        appsWithRecognizers.forEach(appWithRecognizer=> {
          appContents[appWithRecognizer].recognizers.forEach((recognizerObject:ZLUX.RecognizerObject)=> {
            ZoweZLUX.dispatcher.addRecognizerObject(recognizerObject);
          });
          this.log.info(`ZWED5055I`, appContents[appWithRecognizer].recognizers.length, appWithRecognizer); //this.log.info(`Loaded ${appContents[appWithRecognizer].recognizers.length} recognizers for App(${appWithRecognizer})`);
        });
      }
    });
    this.http.get(actionsUri).subscribe((config: any)=> {
      if (config) {
        let appContents = config.contents;
        let appsWithActions:string[] = [];
        plugins.forEach((plugin:ZLUX.Plugin)=> {
          let id = plugin.getIdentifier();
          if (appContents[id]) {
            appsWithActions.push(id);
          }
        });
        appsWithActions.forEach(appWithAction=> {
          appContents[appWithAction].actions.forEach((actionObject:any)=> {
            if (this.isValidAction(actionObject)) {
              ZoweZLUX.dispatcher.registerAbstractAction(ZoweZLUX.dispatcher.makeActionFromObject(actionObject));
            }
          });
          this.log.info(`ZWED5056I`, appContents[appWithAction].actions.length, appWithAction); //this.log.info(`Loaded ${appContents[appWithAction].actions.length} actions for App(${appWithAction})`);
        });
      }
    });
    return true;
  }

  isValidAction(actionObject: any): boolean {
    switch (actionObject.objectType) {
      case 'ActionContainer':
      return actionObject.id && actionObject.defaultName && actionObject.children && actionObject.children.length > 0;

      default:
      const mode: any = ZoweZLUX.dispatcher.constants.ActionTargetMode[actionObject.targetMode];
      const type: any = ZoweZLUX.dispatcher.constants.ActionType[actionObject.type];
      return (actionObject.id && actionObject.defaultName && actionObject.targetId
        && actionObject.arg && mode !== undefined && type !== undefined);
    }
  }
}

window.onbeforeunload = function(e: Event) {
  let dialogText = 'Are you sure you want to navigate away from the Desktop? Apps & Changes will be lost.';
  e.returnValue = false;
  return dialogText;
}


/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html

  SPDX-License-Identifier: EPL-2.0

  Copyright Contributors to the Zowe Project.
*/

