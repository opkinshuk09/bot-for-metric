const { Client, GatewayIntentBits, Partials, Collection } = require("discord.js");
const yaml = require('js-yaml');
const express = require("express");
const fs = require("fs");
const chalk = require("chalk");
const ticketRoutes = require("../utils/ticketRoutes.js");
const paypal = require("paypal-rest-sdk");
const { QuickDB } = require("quick.db");

module.exports = class BotClient extends Client {
  constructor() {
    super({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages,
      GatewayIntentBits.DirectMessageReactions, GatewayIntentBits.GuildPresences, GatewayIntentBits.MessageContent], 
      partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember]});
    
    // Files //
    
    this.config = yaml.load(fs.readFileSync('./configs/config.yml', 'utf8'));
    this.language = yaml.load(fs.readFileSync('./configs/language.yml', 'utf8'));
    this.cmdConfig = yaml.load(fs.readFileSync('./configs/commands.yml', 'utf8'));
    this.embeds = yaml.load(fs.readFileSync('./configs/embeds.yml', 'utf8'));
    this.utils = require("../utils/utils.js");
    this.embedBuilder = require("../embeds/embedBuilder.js");

    // Other //
    
    paypal.configure({
      'mode': 'live',
      'client_id': this.config.paypal.client_id,
      'client_secret': this.config.paypal.secret
    });
    
    this.paypal = paypal;
    
    this.startServer();
    
    this.db = new QuickDB();
    
    this.aliases = new Collection();
    this.commands = new Collection();
    this.slashCommands = new Collection();
    this.slashArray = [];
    this.addonList = [];
    this.cmdCooldowns = [];
  }
  async login(token = this.config.general.token) {
    super.login(token);
  }
  startServer() {
    if(this.config.server.enabled == true) {
      const app = express();
      app.use(express.json());
      
      if (this.config.server.selfhost.enabled == true) {
        // All routes related to tickets
        app.use("/tickets", ticketRoutes);
      }
      
      app.listen(this.config.server.port || "7070", () => console.log(chalk.yellow("[SERVER] ") + `Server has started on port ${this.config.server.port}.`));
    }
  }
}
