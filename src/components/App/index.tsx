import React from 'react';
import { inject, observer } from 'mobx-react';
import { AccountStore } from "@stores";
import { Route, Router } from 'react-router-dom';
import { History } from 'history';
import DappUi from "@components/DappUi";
import NotificationsStore from "@stores/NotificationStore";
import Home from "@components/Home";

interface IProps {
    accountStore?: AccountStore
    notificationStore?: NotificationsStore
    history: History
}

interface IState {
    collapsedSidebar: boolean
}


@inject('accountStore', 'notificationStore')
@observer
class App extends React.Component<IProps, IState> {

    state = {
        collapsedSidebar: true
    };

    componentDidMount(): void {
        const accountStore = this.props.accountStore!;
        if (accountStore.isBrowserSupportsWavesKeeper) {
            accountStore.setupWavesKeeper();
        } else {
            this.props.notificationStore!.notify('you use unsupported browser', {
                type: 'warning',
                link: "https://wavesplatform.com/technology/keeper",
                linkTitle: 'more'
            });
        }

    }

    render() {
        return <Router history={this.props.history}>
            <Route exact path="/" component={Home}/>
            <Route path="/:string" component={DappUi}/>
        </Router>
    }
}


export default App;
