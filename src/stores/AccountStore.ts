import { action, autorun, computed, observable, set } from 'mobx';

import { RootStore } from '@stores';
import { SubStore } from './SubStore';

import { checkSlash, getCurrentBrowser } from '@utils';

interface IWavesKeeperAccount {
    address: string
    name: string
    network: string
    networkCode: string
    publicKey: string
    type: string
    balance: {
        available: string
        leasedOut: string
        network: string
    }
}

interface INetwork {
    code: string,
    server: string,
    matcher: string
}

interface IKeeperError {
    code: string
    data: any
    message: string
}

interface IAsset {
    assetId: string
    name: string
}

class AccountStore extends SubStore {
    @observable applicationNetwork: string = 'custom';
    @observable wavesKeeperAccount?: IWavesKeeperAccount;

    @observable isWavesKeeperInitialized: boolean = false;
    @observable isWavesKeeperInstalled: boolean = false;

    @observable isApplicationAuthorizedInWavesKeeper: boolean = false;

    @observable network: INetwork | null = null;
    @observable assets: IAsset[] = [{name: 'WAVES', assetId: 'WAVES'}];

    constructor(rootStore: RootStore) {
        super(rootStore);
    }

    @computed
    get isBrowserSupportsWavesKeeper(): boolean {
        const browser = getCurrentBrowser();
        return ['chrome', 'firefox', 'opera', 'edge'].includes(browser);
    }


    @action
    async updateAccountAssets(publicState: any) {
        if (!publicState || !publicState.network || !publicState.account) return;
        const server = publicState.network.server;
        const path = `${checkSlash(server)}assets/balance/${publicState.account.address}`;
        const resp = await fetch(path);
        const assets: {balances: {assetId: string, issueTransaction: {name: string}}[]} = await (resp).json();
        if ('balances' in assets) {
            this.assets = [
                {name: 'WAVES', assetId: 'WAVES'},
                ...assets.balances.map(({assetId, issueTransaction: {name}}) => ({assetId, name}))
            ];
        }
    }

    @action
    updateWavesKeeperAccount = (account: IWavesKeeperAccount) => {
        this.wavesKeeperAccount && set(this.wavesKeeperAccount, {
            ...account
        });
    };

    @action
    resetWavesKeeperAccount = () => {
        this.wavesKeeperAccount = undefined;
    };

    @action
    async updateWavesKeeper(publicState: any) {
        this.updateNetwork(publicState);
        this.updateAccountAssets(publicState);
        if (this.wavesKeeperAccount) {
            publicState.account
                ? this.updateWavesKeeperAccount(publicState.account)
                : this.resetWavesKeeperAccount();
        } else {
            this.wavesKeeperAccount = publicState.account;
        }
    }

    @action
    updateNetwork = (publicState: any) => {
        if (publicState.network && publicState.network !== this.network) {
            this.network = publicState.network;
        }
    };

    setupWavesKeeper = () => {
        let attemptsCount = 0;

        autorun(
            (reaction) => {
                if (attemptsCount === 2) {
                    reaction.dispose();
                    console.error('keeper is not installed');
                    this.rootStore.notificationStore.notify('keeper is not installed', {
                        type: 'warning',
                        link: "https://wavesplatform.com/technology/keeper",
                        linkTitle: 'install waves keeper'
                    });
                } else if (window['WavesKeeper']) {
                    reaction.dispose();
                    this.isWavesKeeperInstalled = true;
                    window['WavesKeeper'].publicState()
                        .then((state: any) => this.updateNetwork(state))
                        .catch((e: any) => {
                            console.error(e);
                            this.rootStore.notificationStore.notify(e.message, {type: 'error'});
                        });
                } else {
                    attemptsCount += 1;
                }
            },
            {scheduler: run => setInterval(run, 1000)}
        );
    };

    @action
    setupSynchronizationWithWavesKeeper = () => {
        window['WavesKeeper'].initialPromise
            .then((keeperApi: any) => {
                this.isWavesKeeperInitialized = true;
                return keeperApi;
            })
            .then((keeperApi: { publicState: () => void; }) => keeperApi.publicState())
            .then((publicState: any) => {
                this.isApplicationAuthorizedInWavesKeeper = true;
                this.updateWavesKeeper(publicState).catch(e => {
                    this.rootStore.notificationStore.notify(e, {type: 'error'});
                    console.error(e);
                });
                this.subscribeToWavesKeeperUpdate();
            })
            .catch((error: IKeeperError) => {
                if (error.code === '14') {
                    this.isApplicationAuthorizedInWavesKeeper = true;
                    this.subscribeToWavesKeeperUpdate();
                } else {
                    this.isApplicationAuthorizedInWavesKeeper = false;
                }
            });
    };

    login = async () => {
        const resp = window['WavesKeeper'].publicState();
        const publicState = await resp;
        if (publicState.account && publicState.account.address) {
        }
        return resp;
    };

    subscribeToWavesKeeperUpdate() {
        window['WavesKeeper'].on('update', async (publicState: any) => {
            this.updateWavesKeeper(publicState).catch(e => {
                this.rootStore.notificationStore.notify(e, {type: 'error'});
                console.error(e);
            });
        });
    }
}

export default AccountStore;