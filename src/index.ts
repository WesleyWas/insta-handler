import BotService from "./services/bot.services";
import {getAllInstances, getFormattedInstance} from "./services/bot.api";
import apiHandler from './services/bot.api.receiver';

let botInstances:Array<BotInstance> = [];

class BotInstance{
    bot: BotService;
    username: string;
    password: string;
    bubble_uuid: string;
}

start().then(r => "Ok");

async function start(){

    await fillInstances();

    console.log('Hello');

    botInstances.forEach((bot) => {
        const apiReceiver:apiHandler = new apiHandler(bot.bot);
        bot.bot.startMainLoop(true);
    });
}

async function fillInstances(){
    const instances:any = await getAllInstances();
    for (const instance of instances) {
        const data = await getFormattedInstance(instance);
        botInstances.push(data);
        await data.bot.login();
    }
}