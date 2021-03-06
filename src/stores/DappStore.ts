import { SubStore } from './SubStore';
import { checkSlash } from '@utils'
import { IArgumentInput } from "@components/DappUi/Card";
import { base58Decode, base64Encode } from '@waves/ts-lib-crypto'
import { getExplorerLink } from "@utils/index";

export type ICallableArgumentType =
    'Int' | 'String' | 'ByteVector' | 'Boolean'


export interface ICallableFuncArgument {
    [arg: string]: ICallableArgumentType
}

export interface ICallableFuncTypes {
    [func: string]: ICallableFuncArgument
}

export interface IMeta {
    callableFuncTypes?: ICallableFuncTypes
    version?: number
}


interface IKeeperTransactionDataCallArg {
    type: string,
    value: string | number | boolean
}

interface IKeeperTransactionDataCall {
    function: string,
    args: IKeeperTransactionDataCallArg[]
}

interface IKeeperTransactionDataFee {
    tokens: string,
    assetId: string
}

interface IKeeperTransactionPayment {
    assetId: string,
    tokens: number
}

interface IKeeperTransactionData {
    dApp: string,
    call: IKeeperTransactionDataCall,
    payment: IKeeperTransactionPayment[]
    fee: IKeeperTransactionDataFee,
}

export interface IKeeperTransaction {
    type: number,
    data: IKeeperTransactionData
}

class DappStore extends SubStore {

    getDappMeta = async (address: string, server: string) => {//todo handle error
        const path = `${checkSlash(server)}addresses/scriptInfo/${address}/meta`;
        const resp = await fetch(path);
        return await (resp).json();
    };

    private convertArgValue = (arg: IArgumentInput): (string | number | boolean) => {
        const {value, type, byteVectorType} = arg;
        if (value === undefined) {
            this.rootStore.notificationStore.notify('value is undefined', {type: 'error'});
            return ''
        }
        if (type === 'Boolean' && ['true', 'false'].includes(value)) return value === 'true';
        if (type === 'Int' && !isNaN(+value)) return +value;
        if (byteVectorType === 'base58') return `base64:${b58strTob64Str(value)}`;
        if (byteVectorType === 'base64') return `base64:${value}`;
        else return value
    };
    private convertArgType = (type: ICallableArgumentType): string => {
        switch (type) {
            case "Boolean":
                return 'boolean';
            case "ByteVector":
                return 'binary';
            case "Int":
                return 'integer';
            case "String":
                return 'string';
        }
        return type
    };

    private convertArgs = (args: IArgumentInput[]): IKeeperTransactionDataCallArg[] =>
        args.filter(({value}) => value !== undefined)
            .map(arg => ({type: this.convertArgType(arg.type), value: this.convertArgValue(arg)}));

    callCallableFunction = (address: string, func: string, inArgs: IArgumentInput[], payment: IKeeperTransactionPayment[]) => {
        const {accountStore} = this.rootStore;
        let args: IKeeperTransactionDataCallArg[] = [];
        try {
            args = this.convertArgs(inArgs)
        } catch (e) {
            console.error(e);
            this.rootStore.notificationStore.notify(e, {type: 'error'});
        }
        const transactionData: IKeeperTransactionData = {
            dApp: address,
            call: {
                function: func,
                args
            },
            fee: {tokens:  this.rootStore.accountStore.scripted ? '0.009' : '0.005', assetId: 'WAVES'},
            payment
        };

        const tx: IKeeperTransaction = {
            type: 16,
            data: transactionData
        };

        if (!accountStore.isApplicationAuthorizedInWavesKeeper) {
            this.rootStore.notificationStore.notify('Application is not authorized in WavesKeeper', {type: 'warning'});
            return
        }
        window['WavesKeeper'].signAndPublishTransaction(tx).then((tx: any) => {
            const transaction = JSON.parse(tx);
            const {network} = accountStore;
            const link = network  ? getExplorerLink(network!.code, transaction.id, 'tx') : undefined;
            console.log(transaction);
            this.rootStore.notificationStore
                .notify(
                    `Transaction sent: ${transaction.id}\n`,
                    {type: 'success', link, linkTitle: 'View transaction'})

        }).catch((error: any) => {
            console.error(error);
            this.rootStore.notificationStore.notify(error.data, {type: 'error', title: error.message});
        });
    };

}

function b58strTob64Str(str = ''): string {
    const error = 'incorrect base58';
    if (str === '') throw error
    try {
        return base64Encode(base58Decode(str));
    } catch (e) {
        throw error
    }
}


export default DappStore;
