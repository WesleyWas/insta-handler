import BotService from "./bot.services";
import InstaMedia from "./bot.services";
import InstaUser from './bot.services';
import axios from "axios";

const live = false;
const rootURL = "https://insta-handler.bubbleapps.io/version-" + (live ? "live" : "test") + "/api/1.1/obj/";
const mediaRootURL = rootURL + "instapost";
const instanceRootURL = rootURL + "instainstance";
const userRootURL = rootURL + "instauser";

export default class ApiConnector{
    bot: BotService;

    constructor(bot:BotService) {
        this.bot = bot;
    }

    formatUserToJSON(user:any){
        let query = "{" + "\"media_count\": \"" + user.media_count + "\", \"username\": \"" + user.username + "\", \"follower_count\": \"" + user.follower_count + "\", \"following_count\": " + user.following_count + ", \"full_name\": \"" + user.full_name + "\", \"gotFromAccount\": \"" + user.gotFromAccount + "\", \"gotFromAccountID\": \"" + user.gotFromAccontID + "\", \"id\": " + user.id + ", \"is_private\": " + user.isPrivate + ", \"is_verified\": \"" + user.isVerified + "\", \"bubble_instance_uuid\": \"" + user.bubble_instance_uuid + "\", \"is_business\": \"" + user.isBusiness + "\"}";
        return query;
    }

    formatMediaToJSON(media:any){
        let query = "{" + "\"caption\": \"" + media.caption + "\", \"author_id\": \"" + media.author_id + "\", \"author_username\": \"" + media.author_username + "\", \"comment_count\": " + media.comment_count + ", \"like_count\": " + media.like_count + ", \"created_at\": \"" + media.created_at + "\", \"image_url\": \"" + media.image_url + "\", \"picture_height\": " + media.picture_height + ", \"picture_width\": " + media.picture_width + ", \"insta_id\": \"" + media.id + "\", \"bubble_instance_uuid\": \"" + media.bubble_instance_uuid + "\"}";
        return query;
    }


    async sendRandomPictureToDatabase(){
        const medias = await this.bot.getLatestPosts(this.bot.scrape_account_limit, this.bot.scrape_pictures_per_account_limit);
        let finalQuery = this.formatMediaToJSON(medias[0]);

        for(let i = 1; i < medias.length; i++){
            finalQuery += "\n" + this.formatMediaToJSON(medias[i]);
        }

        try{
            const request = await axios.post(mediaRootURL + '/bulk', finalQuery, {
                "headers": {
                    'Content-Type': 'text/plain'
                }
            });
        }catch(e){
            console.log("Error while posting to Bubble DB");
        }
    }

    async sendUsersToDatabase(users:Array<any>){
        console.log("User 0 :");
        console.log(users[0]);
        const limit = users.length > 1000 ? 1000 : users.length;
        let query = this.formatUserToJSON(users[0]);

        for(let i = 0; i < limit; i++){
            query += "\n" + this.formatUserToJSON(users[i]);
        }
        console.log(query);

        try{
            const request = await axios.post(userRootURL + '/bulk', query, {
                "headers": {
                    'Content-Type': 'text/plain'
                }
            });
            console.log(request);
        }catch(e){
            console.log("Error by posting users to DB : " + e);
        }

    }

    async getRandomPostsFromDB(limit:number){
        if(limit > 100){
            limit = 100;
        }
        const query = mediaRootURL + "?constraints=[{\"key\": \"bubble_instance_uuid\", \"constraint_type\":\"text contains\", \"value\": \"" + this.bot.bubble_instance_uuid + "\"}" +
            ", {\"key\": \"post_status\", \"constraint_type\": \"not equal\", \"value\": \"Posted\"}]" +
            "&limit=" + limit +
            "&sort_field=_random_sorting";
        const encodedQuery = encodeURI(query);
        let request;
        try{
            request = await axios.get(encodedQuery);
            return request.data.response.results;
        }catch(e){
            console.log(e);
        }
    }

    async markPostAsPosted(media:any){
        try{
            const request = await axios.patch(mediaRootURL + "/" + media._id, {
                "post_status": "Posted"
            });
        }catch(e){
            console.log(e);
        }
    }
    async markUserAsFollowed(bubble_uuid:string){
        try{
            const request = await axios.patch(userRootURL + "/" + bubble_uuid, {
                "followed": true
            });
            console.log("User has been marked as followed.");
        }catch(e){
            console.log("Error by marking user as followed : " + e);
        }
    }

    async getSomeoneToFollow(instanceID:string, only_public:boolean){
        try{

            const query = userRootURL + "?constraints=[{\"key\": \"bubble_instance_uuid\", \"constraint_type\": \"text contains\", \"value\": \"" + instanceID + "\"}" +
                ",{\"key\": \"followed\", \"constraint_type\": \"equals\", \"value\": \"false\"}" +
                (only_public ? ",{\"key\": \"is_private\", \"constraint_type\": \"equals\", \"value\": \"false\"}" : "") + "]" +
                "&limit=1" +
                "&sort_field=_random_sorting";
            const encodedQuery = encodeURI(query);
            console.log(query);
            const request = await axios.get(encodedQuery);
            if(request.data !== null && request.data !== undefined){
                return request.data.response.results[0];
            }
        }catch(e){
            console.log(e);
        }
    }
}

export async function getAllInstances(){
    const request = await axios.get(instanceRootURL);
    const instances = request.data.response.results;
    return instances;
}

export async function getFormattedInstance(instance:any){
    const ig_username = instance.ig_username;
    const ig_password = instance.ig_password;
    const bubble_uuid = instance._id;
    const scrape_account_limit = instance.scrape_account_limit;
    const scrape_pictures_per_account_limit = instance.scrape_pictures_per_account_limit;
    const daily_posts = instance.daily_posts;
    const source_accounts = instance.source_accounts;
    const source_accounts_id = instance.source_accounts_id;
    const possible_captions = instance.possible_captions;
    const bot = new BotService(ig_username, ig_password, scrape_account_limit, scrape_pictures_per_account_limit, bubble_uuid, source_accounts, source_accounts_id, daily_posts, possible_captions);
    const data = {
        bot: bot,
        username: ig_username,
        password: ig_password,
        bubble_uuid: bubble_uuid,
    }
    return data;
}
