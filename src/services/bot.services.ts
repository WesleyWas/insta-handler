// @ts-ignore
import {Feed, IgApiClient, UserRepositoryInfoResponseUser} from 'instagram-private-api'
import { config } from 'dotenv';
import fs from 'fs';
import Bluebird, {is} from "bluebird";
import {get} from "request-promise";
import schedule, {Job} from "node-schedule";
import * as process from "process";
import ApiConnector from "./bot.api";

const maxFollowPerDay = 50;

'use strict'

class InstaUser{
    follower_count: number;
    following_count: number;
    full_name: string;
    gotFromAccount: string;
    gotFromAccontID: number;
    id: number;
    isBusiness: boolean;
    isPrivate: boolean;
    isVerified: boolean;
    username: string;
    bubble_instance_uuid: string;
    media_count: number;
    _id: string;
    constructor(info:UserRepositoryInfoResponseUser, gotFromAccount:string, gotFromAcountID: number, bubble_instance_uuid: string){
        this.username = info.username;
        this.follower_count = info.follower_count;
        this.following_count = info.following_count;
        this.full_name = info.full_name;
        this.gotFromAccontID = gotFromAcountID;
        this.gotFromAccount = gotFromAccount;
        this.id = info.pk;
        this.isBusiness = info.is_business;
        this.isPrivate = info.is_private;
        this.isVerified = info.is_verified;
        this.bubble_instance_uuid = bubble_instance_uuid;
        this.media_count = info.media_count;
    }
}

class InstaMedia{
    caption: string;
    author_id: number;
    author_username: string;
    comment_count: number;
    like_count: number;
    created_at: Date;
    image_url: string;
    location: string;
    picture_height: number;
    picture_width: number;
    id: string;
    bubble_instance_uuid: string;
    _id: string; //THIS IS THE BUBBLE UUID IF THE POST
    constructor(caption: string, author_id: number, author_username: string, comment_count: number, like_count:number, created_at: Date, image_url: string, location: string, picture_height: number, picture_width: number, id:string, bubble_instance_uuid: string){
        this.caption = caption;
        this.author_id =  author_id;
        this.author_username = author_username;
        this.comment_count = comment_count;
        this.like_count = like_count;
        this.created_at = created_at;
        this.image_url = image_url;
        this.picture_height = picture_height;
        this.picture_width = picture_width;
        this.id = id;
        this.bubble_instance_uuid = bubble_instance_uuid;
    }
}

export default class BotService{
    ig: IgApiClient;
    user: string;
    pass: string;
    data: any;
    source_accounts: Array<string>;
    source_accounts_id: Array<number>;
    daily_posts: number;
    start_posting_hour: number;
    end_posting_hour: number;
    api: ApiConnector;
    scrape_account_limit: number;
    scrape_pictures_per_account_limit: number;
    bubble_instance_uuid: string;
    possible_captions: Array<string>;
    todays_follow_count: number;
    constructor(username:string, password:string, scrape_account_limit:number, scrape_pictures_per_account_limit:number, bubble_instance_uuid:string, source_accounts:Array<string>, source_accounts_id:Array<number>, daily_posts: number, possible_captions:Array<string>){
        config();
        const fs = require('fs');
        this.user = username;
        this.pass = password;
        this.ig = new IgApiClient();
        const raw = fs.readFileSync("./src/services/data.json");
        this.data = JSON.parse(raw);
        this.source_accounts = source_accounts;
        this.source_accounts_id = source_accounts_id;
        this.daily_posts = daily_posts;
        this.start_posting_hour = this.data.start_posting_hour;
        this.end_posting_hour = this.data.end_posting_hour;
        this.api = new ApiConnector(this);
        this.scrape_account_limit = scrape_account_limit;
        this.scrape_pictures_per_account_limit = scrape_pictures_per_account_limit;
        this.bubble_instance_uuid = bubble_instance_uuid;
        this.possible_captions = possible_captions;
        this.todays_follow_count = 0;
    }

    async saveState(state:any){
        await fs.writeFileSync("./src/data/state_" + this.user + ".json", JSON.stringify(state));
    }

    async hasState(){
        if(fs.existsSync("./src/data/state_" + this.user + ".json")){
            let exists = JSON.parse(fs.readFileSync("./src/data/state_" + this.user + ".json", 'utf-8')).cookies;
            if(exists !== null && exists !== undefined){
                return true;
            }else{
                return false;
            }
        }else{
            return false;
        }
    }

    async loadState(){
        const state = fs.readFileSync("./src/data/state_" + this.user + ".json", 'utf-8');
        return state;
    }

    async login(){
        this.ig.state.generateDevice(this.user);
        console.log('Generated device.');

        if(await this.hasState()){
            await this.ig.state.deserialize(await this.loadState());
            console.log('Loaded state.');
        }else{
            let loggedInUser = await this.ig.account.login(this.user, this.pass);
            console.log("Successfully logged in.");
            const serialize = await this.ig.state.serialize();
            delete serialize.constants;
            await this.saveState(serialize);
            console.log('Saved state.');
        }

        return true;
    }

    async getLatestPosts(accountsLimit:number, mediasLimitPerAccount: number){

        const ids = [];
        let medias:Array<InstaMedia> = [];

        let accounts = accountsLimit === -1 ? this.source_accounts.length : accountsLimit;

        for(let i = 0; i < accounts; i++){
            try{

                ids[i] = await this.ig.user.getIdByUsername(this.source_accounts[i]);
                const feed = await this.ig.feed.user(ids[i]);
                let posts = await feed.items();
                let limit = mediasLimitPerAccount;
                if(limit === -1){
                    posts = await this.getAllItemsFromFeed(feed);
                    limit = posts.length;
                }

                for(let j = 0; j < limit; j++){
                    if(posts[j] !== null && posts[j] !== undefined){
                        let url;
                        let id = posts[j].id;
                        let caption;
                        let location = posts[j].location === undefined ? "undefined" : posts[j].location.short_name;
                        let author_username = posts[j].user.username;
                        let author_id = await this.ig.user.getIdByUsername(author_username);
                        let like_count = posts[j].like_count;
                        let created_at = new Date(posts[j].taken_at * 1000);
                        let comment_count = posts[j].comment_count;
                        let picture_width = posts[j].original_width === undefined ? posts[j].carousel_media[0].original_width : posts[j].original_width;
                        let picture_height = posts[j].original_height === undefined ? posts[j].carousel_media[0].original_height : posts[j].original_height;
                        let bubble_instance_uuid = this.bubble_instance_uuid;

                        if(posts[j].carousel_media !== null && posts[j].carousel_media !== undefined) {
                            url = posts[j].carousel_media[0].image_versions2.candidates[0].url;
                        }else{
                            url = posts[j].image_versions2.candidates[0].url;
                        }

                        if(posts[j].caption !== null && posts[j].caption !== null){
                            caption = posts[j].caption.text;
                        }

                        let media = new InstaMedia(caption === undefined ? "undefined" : caption, author_id, author_username, comment_count, like_count, created_at, url, location, picture_height, picture_width, id, bubble_instance_uuid);
                        medias.push(media);
                    }
                }

            }catch (e) {
                console.log("CE : " + e);
            }
        }
        console.log("Successfully scraped " + medias.length + " posts.");
        return medias;
    }

    async postMedia(data:InstaMedia){
        const imageBuffer = await get({
            url: data.image_url, // random picture with 800x800 size
            encoding: null, // this is required, only this way a Buffer is returned
        });

        const locations = await this.ig.search.location(0, 0, data.location);
        const mediaLocation = locations[0];

        const publishResult = await this.ig.publish.photo({
            file: imageBuffer,
            caption: data.caption,
            location: mediaLocation
        });
        return publishResult;
    }

    async startMainLoop(postToday: boolean){
        console.log("Starting main loop for account @" + this.user);
        await this.login();
        const dailyRule = new schedule.RecurrenceRule();
        dailyRule.hour = 0;
        dailyRule.tz = 'Etc/GMT+1';

        /*
            All the instructions inside this block will execute once every day at midnight
         */
        const dailyJob = schedule.scheduleJob(dailyRule, async () => {
            await this.scheduleDailyPosts();
            this.todays_follow_count = 0;
        });

        if(postToday){
            await this.scheduleDailyPosts();
        }

        //gawait this.followLoop();
    }

    async followLoop(){
        console.log("Follow loop started.");
        while(this.todays_follow_count < maxFollowPerDay){
            const randomMinute = 1*1000*60;

            const dbUser:InstaUser = await this.api.getSomeoneToFollow(this.bubble_instance_uuid, true);
            if(dbUser !== null && dbUser !== undefined){
                console.log("Got one follower");
                await this.followUser(dbUser.id);
                await this.api.markUserAsFollowed(dbUser._id);
                console.log("Just followed " + dbUser.full_name + " (" + dbUser.isPrivate ? "Private" : "Public" + "), who has " + dbUser.media_count + " medias uploaded.");
                console.log("Waiting " + randomMinute/1000/60 + "mins before following someone else... (" + this.todays_follow_count + "/" + maxFollowPerDay + ")");
                await new Promise(resolve => setTimeout(resolve, randomMinute));
            }else{
                console.log("This dbUser is undefined.");
            }
        }
    }

    async scheduleDailyPosts(){
        const posts:Array<InstaMedia> = await this.api.getRandomPostsFromDB(this.daily_posts);
        for(let i = 0; i < this.daily_posts; i++){
            await this.schedulePostAtRandomHour(posts[i]);
        }
    }

    /*
    Schedules a post for today at a randomized hour
    Returns the job
     */
    async schedulePostAtRandomHour(post:InstaMedia){
        const date = new Date();
        const beginHour = this.start_posting_hour > date.getHours() ? this.start_posting_hour : date.getHours() + 1;

        const randomHour = this.getRandomInt(beginHour, this.end_posting_hour);
        const randomMinute = this.getRandomInt(0, 60);
        const randomSecond = this.getRandomInt(0, 60);

        date.setHours(randomHour);
        date.setMinutes(randomMinute);
        date.setSeconds(randomSecond);

        post.caption = this.possible_captions[Math.floor(Math.random()*this.possible_captions.length)];

        console.log("Media with caption " + post.caption + " will be posted today at " + date.toTimeString());

        return this.postMediaAtSpecificDate(post, date);
    }

    getRandomInt(min:number, max:number) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min) + min);
    }

    async postMediaAtSpecificDate(post:any, date: Date){
        const job = await schedule.scheduleJob(date, async () => {
            try{
                await this.postMedia(post);
                await this.api.markPostAsPosted(post);
                console.log("Media should be marked as posted.");
            }catch(e){
                console.log("ERROR : " + e);
            }
        });
        return job;
    }

    async getFollowersOfSpecificAccount(username: string, limit:number){

        let users:Array<InstaUser> = [];

        const id = await this.ig.user.getIdByUsername(username);
        const followersFeed = await this.ig.feed.accountFollowers(id);
        //Use the method below to get all the followers at once, and avoid the 100 items pagination
        //const followers = await this.getAllItemsFromFeed(followersFeed);
        const followers = await followersFeed.items();
        console.log(followers.length);

        let i = 0;

        while(i < limit){
            try{
                const follower = followers[i];
                const infos = await this.ig.user.info(follower.pk);
                const myID = await this.ig.user.getIdByUsername(this.user);
                const user = new InstaUser(infos, this.user, myID, this.bubble_instance_uuid);
                users.push(user);
            }catch(e){
                console.log(e);
            }
            i++;
        }
        return users;
    }

    async followUserByUsername(username: string){
        const id = await this.ig.user.getIdByUsername(username);
        if(id !== null && id !== undefined){
            await this.followUser(id);
        }
    }

    async unfollowUserByUsername(username: string){
        const id = await this.ig.user.getIdByUsername(username);
        if(id !== null && id !== undefined){
            await this.unfollowUser(id);
        }
    }

    async followUser(uuid: number){
        console.log(uuid);
        const user = await this.ig.friendship.create(uuid);
        const info = await this.ig.user.info(uuid);
        console.log("@" + info.username);
        this.todays_follow_count += 1;
        return user;
    }

    async unfollowUser(uuid: number){
        const unfollowedUser = await this.ig.friendship.destroy(uuid);
        console.log(unfollowedUser);
    }

    async getAllItemsFromFeed<T>(feed: Feed<any, T>): Promise<T[]> {
        let items: any[] | PromiseLike<T[]> = [];
        do {
            items = items.concat(await feed.items());
        } while (feed.isMoreAvailable());
        return items;
    }

    async getInfos(username: string){
        const id = await this.ig.user.getIdByUsername(username);
        const infos = await this.ig.user.info(id);
        console.log(infos);
    }

    printPost(data:any){
        console.log("======================");
        console.log("URL : " + data.image_url);
        console.log("Légende : " + data.caption);
        console.log("Localisation : " + data.location);
        console.log("Username : " + data.author_username);
        console.log("UUID : " + data.author_id);
        console.log("Posté à : " + data.created_at);
        console.log(data.like_count + " likes");
        console.log(data.comment_count + " commentaires");
        console.log("Dimension : " + data.picture_width + "x" + data.picture_height);
    }

}