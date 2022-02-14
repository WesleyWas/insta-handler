import express, {Express} from 'express'
import {getAllInstances, getFormattedInstance} from "./bot.api";
import BotService from "./bot.services";
import InstaUser from "./bot.services";


const port = 8080 || process.env.PORT;
const APIKEY = "null" || process.env.BUBBLE_API_KEY;

export default class requestsHandler {
    app: Express;
    bot: BotService;

    constructor(bot:BotService) {
        this.app = express();
        this.bot = bot;
        this.listen();
        this.definePaths();
    }

    listen(){
        this.app.listen(port, async () => {
            console.log(`Server started at http://localhost:${port}`);
        });
    }

    definePaths(){
        this.app.get('/updateUsersToFollow/:instance_id', async (req, res) => {

            let users:Array<any> = new Array<any>();
            const limit = 10;
            for(let i = 0; i < this.bot.source_accounts.length; i++){
                console.log("Searching " + this.bot.source_accounts[i] + "'s followers...");
                let currentSourceUsers:Array<any> = await this.bot.getFollowersOfSpecificAccount(this.bot.source_accounts[i], limit);
                console.log("Source users : " + currentSourceUsers.length);
                users = users.concat(currentSourceUsers);
            }
            console.log(users);
            await this.bot.api.sendUsersToDatabase(users);
        });
    }

}