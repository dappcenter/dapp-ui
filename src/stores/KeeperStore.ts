import { SubStore } from '@stores/SubStore';
import { action, autorun, computed, observable, set } from 'mobx';
import { checkSlash } from '@utils';
import { nodeInteraction } from '@waves/waves-transactions';
import { RootStore } from '@stores/RootStore';
import { getCurrentBrowser, getExplorerLink } from '@utils/index';

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

export interface INetwork {
    code: string,
    server: string,
    matcher?: string
}

interface IKeeperError {
    code: string
    data: any
    message: string
}

export interface IAsset {
    assetId: string
    name: string
    decimals: number
}


class KeeperStore extends SubStore {

    constructor(rootStore: RootStore) {
        super(rootStore);
        if (isBrowserSupportsWavesKeeper()) {
            this.setupWavesKeeper();
        } else {
            this.rootStore.notificationStore!.notify('you use unsupported browser', {
                type: 'warning',
                link: "https://wavesplatform.com/technology/keeper",
                linkTitle: 'more'
            });
        }

    }

    @observable wavesKeeperAccount?: IWavesKeeperAccount;

    @observable isWavesKeeperInitialized: boolean = false;
    @observable isWavesKeeperInstalled: boolean = false;

    @observable isApplicationAuthorizedInWavesKeeper: boolean = false;

    @action
    login = async () => {
        const resp = window['WavesKeeper'].publicState();
        const publicState = await resp;
        if (publicState.account && publicState.account.address) {
            this.rootStore.accountStore.address = publicState.account.address;
            // this.rootStore.dappStore.updateDetails(publicState.account.address);
            // this.rootStore.accountStore.isAuthorized = true;
            this.rootStore.accountStore.loginType = 'keeper';

        }
        return resp;
    };


    @action
    async updateAccountAssets(publicState: any) {
        if (!publicState || !publicState.network || !publicState.account) return;
        const server = publicState.network.server;
        const path = `${checkSlash(server)}assets/balance/${publicState.account.address}`;
        const resp = await fetch(path);
        const assets: { balances: { assetId: string, issueTransaction: { name: string, decimals: number } }[] } = await (resp).json();
        if ('balances' in assets) {

            this.rootStore.accountStore.assets = {
                'WAVES': {name: 'WAVES', assetId: 'WAVES', decimals: 8},
                ...assets.balances.reduce((acc, {assetId, issueTransaction: {name, decimals}}) =>
                    ({...acc, [assetId]: {assetId, name, decimals}}), {})
            };
        }
    }


    @action
    updateWavesKeeperAccount = async (publicState: any) => {
        this.rootStore.accountStore.scripted = (await nodeInteraction.scriptInfo(publicState.account.address, publicState.network.server)).script != null;
        this.wavesKeeperAccount && set(this.wavesKeeperAccount, {
            ...publicState.account
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
                ? this.updateWavesKeeperAccount(publicState)
                : this.resetWavesKeeperAccount();
        } else {
            this.wavesKeeperAccount = publicState.account;
        }
    }

    @action
    updateNetwork = (publicState: any) => {
        if (publicState.network && publicState.network !== this.rootStore.accountStore.network) {
            this.rootStore.accountStore.network = publicState.network;
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
                        link: 'https://wavesplatform.com/technology/keeper',
                        linkTitle: 'install waves keeper'
                    });
                } else if (window['WavesKeeper']) {
                    reaction.dispose();
                    this.isWavesKeeperInstalled = true;
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


    subscribeToWavesKeeperUpdate() {
        window['WavesKeeper'].on('update', async (publicState: any) => {
            this.updateWavesKeeper(publicState).catch(e => {
                this.rootStore.notificationStore.notify(e, {type: 'error'});
                console.error(e);
            });
        });
    }


    sendTx = (tx: any) => window['WavesKeeper'].signAndPublishTransaction(tx).then((tx: any) => {
        const transaction = JSON.parse(tx);
        const {network} = this.rootStore.accountStore;
        const link = network ? getExplorerLink(network!.code, transaction.id, 'tx') : undefined;
        console.dir(transaction);
        this.rootStore.notificationStore
            .notify(
                `Transaction sent: ${transaction.id}\n`,
                {type: 'success', link, linkTitle: 'View transaction'})

    }).catch((error: any) => {
        console.error(error);
        this.rootStore.notificationStore.notify(error.data, {type: 'error', title: error.message});
    })


}

function isBrowserSupportsWavesKeeper(): boolean {
    const browser = getCurrentBrowser();
    return ['chrome', 'firefox', 'opera', 'edge'].includes(browser);
}


export default KeeperStore;