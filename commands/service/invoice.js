const Command = require("../../structures/Command");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ApplicationCommandOptionType, ButtonStyle } = require("discord.js");
const { QuickDB } = require("quick.db");
const db = new QuickDB();

module.exports = class Invoice extends Command {
  constructor(client) {
    super(client, {
      name: "invoice",
      description: client.cmdConfig.invoice.description,
      usage: client.cmdConfig.invoice.usage,
      permissions: client.cmdConfig.invoice.permissions,
      aliases: client.cmdConfig.invoice.aliases,
      category: "service",
      listed: client.cmdConfig.invoice.enabled,
      slash: true,
      options: [{
        name: 'user',
        type: ApplicationCommandOptionType.User,
        description: "User to create invoice for",
        required: true,
      },{
        name: 'amount',
        type: ApplicationCommandOptionType.Number,
        description: "Amount of Money to send",
        required: true,
      }, {
        name: 'service',
        type: ApplicationCommandOptionType.String,
        description: "Service User's paying for",
        required: true,
      }]
    });
  }

  async run(message, args) {
    const config = this.client.config;
    const language = this.client.language;
    const embeds = this.client.embeds;
    const paypal = this.client.paypal;

    let user = message.mentions.users.first();
    let amount = args[1];
    let service = args.slice(2).join(" ");
    
    if(!config.paypal.secret || !config.paypal.client_id) return message.channel.send({ embeds: [this.client.embedBuilder(this.client, message.author, embeds.title, language.general.paypal_cred, embeds.error_color)] });
    
    if(!user) return message.channel.send({ embeds: [this.client.utils.usage(this.client, message, this.client.cmdConfig.invoice.usage)] }); 
    if(!amount || isNaN(amount)) return message.channel.send({ embeds: [this.client.utils.usage(this.client, message, this.client.cmdConfig.invoice.usage)] }); 
    if(!service) return message.channel.send({ embeds: [this.client.utils.usage(this.client, message, this.client.cmdConfig.invoice.usage)] }); 
    
    let invoiceObject = {
      "merchant_info": {
        "email": config.paypal.mail,
        "business_name": config.paypal.title,
      },
      "items": [{
        "name": service,
        "quantity": 1.0,
        "unit_price": {
          "currency": config.general.currency,
          "value": amount
        },
      }],
      "logo_url": message.guild.iconURL(),
      "note": config.paypal.notes.replace("<username>", user.username)
        .replace("<userId>", user.id)
        .replace("<author>", message.author.username)
        .replace("<authorId>", message.author.id)
        .replace("<date>", new Date().toLocaleString()),
      "terms": config.paypal.tos,
      "payment_term": {
        "term_type": "NET_45"
      },
      "tax_inclusive": false,
    }
    
    const validDays = [10, 15, 30, 45, 60, 90];
    if(validDays.includes(config.paypal.days)) {
      invoiceObject.payment_term.due_type = "DUE_ON_DATE_SPECIFIED";
      invoiceObject.payment_term.due_date = "NET_" + config.paypal.days;
    } else if(!validDays.includes(config.paypal.days) && config.paypal.days > 0) {
      this.client.utils.sendError("Invalid Number of Days for PayPal Invocie specified in config.yml");
    }
    
    paypal.invoice.create(invoiceObject, (err, invoice) => {
      if (err) {
        console.log(err)
        this.client.utils.sendError("Invalid PayPal API Secret or Client ID have been provided.");
      } else {
        paypal.invoice.send(invoice.id, async function(error, rv) {
          if (error) {
            console.error(error);
          } else {
            let embed = new EmbedBuilder()
              .setColor(embeds.service.invoiceCreate.color);
            if (embeds.service.invoiceCreate.title) embed.setTitle(embeds.service.invoiceCreate.title);
            
            if (embeds.service.invoiceCreate.description) embed.setDescription(embeds.service.invoiceCreate.description.replace("<amount>", amount)
              .replace("<seller>", message.author)
              .replace("<invoiceId>", invoice.id)
              .replace("<user>", user)
              .replace("<mail>", config.paypal.mail)
              .replace("<currency>", config.general.currency)
              .replace("<currencySymbol>", config.general.currency_symbol)
              .replace("<service>", service));
            
            let field = embeds.service.invoiceCreate.fields;
            for (let i = 0; i < embeds.service.invoiceCreate.fields.length; i++) {
              embed.addFields([{ name: field[i].title.replace("<currency>", config.general.currency), value: field[i].description.replace("<amount>", amount)
                .replace("<seller>", message.author)
                .replace("<invoiceId>", invoice.id)
                .replace("<user>", user)
                .replace("<mail>", config.paypal.mail)
                .replace("<currency>", config.general.currency)
                .replace("<currencySymbol>", config.general.currency_symbol)
                .replace("<service>", service), inline: true }])
            }
            
            if (embeds.service.invoiceCreate.footer == true) embed.setFooter({ text: message.author.username, iconURL: message.author.displayAvatarURL() }).setTimestamp();
            if (embeds.service.invoiceCreate.thumbnail == true) embed.setThumbnail(message.author.displayAvatarURL());
            
            const row = new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                .setURL(`https://www.paypal.com/invoice/payerView/details/${invoice.id}`)
                .setLabel(language.buttons.invoice)
                .setStyle(ButtonStyle.Link),
              );
            
            message.channel.send({ embeds: [embed], components: [row] });
            
            await db.set(`invoice_${invoice.id}`, {
              id: invoice.id,
              guild: message.guild.id,
              author: `${message.author.id}`,
              user: `${user.id}`,
              amount,
              service,
              date: new Date().toLocaleString()
            });
            
            if(config.paypal.invoice_check == true) {
              let checkInvoice = setInterval(async () => {
                paypal.invoice.get(invoice.id, function(e, invoiceData) {
                  if (invoiceData.status == "PAID" || invoiceData.status == "MARKED_AS_PAID") {
                    let invoiceEmbed = new EmbedBuilder()
                      .setColor(embeds.service.invoicePaid.color);
                    if (embeds.service.invoicePaid.title) invoiceEmbed.setTitle(embeds.service.invoicePaid.title);
              
                    if (embeds.service.invoicePaid.description) invoiceEmbed.setDescription(embeds.service.invoicePaid.description.replace("<amount>", amount)
                      .replace("<seller>", message.author)
                      .replace("<invoiceId>", invoice.id)
                      .replace("<user>", user)
                      .replace("<mail>", config.paypal.mail)
                      .replace("<currency>", config.general.currency)
                      .replace("<currencySymbol>", config.general.currency_symbol)
                      .replace("<service>", service));
              
                    let field = embeds.service.invoicePaid.fields;
                    for (let i = 0; i < embeds.service.invoicePaid.fields.length; i++) {
                      invoiceEmbed.addFields([{ name: field[i].title.replace("<currency>", config.general.currency), value: field[i].description.replace("<amount>", amount)
                        .replace("<seller>", message.author)
                        .replace("<invoiceId>", invoice.id)
                        .replace("<user>", user)
                        .replace("<mail>", config.paypal.mail)
                        .replace("<currency>", config.general.currency)
                        .replace("<currencySymbol>", config.general.currency_symbol)
                        .replace("<service>", service), inline: true }])
                    }
              
                    if (embeds.service.invoicePaid.footer == true) invoiceEmbed.setFooter({ text: message.author.username, iconURL: message.author.displayAvatarURL() }).setTimestamp();
                    if (embeds.service.invoicePaid.thumbnail == true) invoiceEmbed.setThumbnail(message.author.displayAvatarURL());
                    message.channel.send({ embeds: [invoiceEmbed] }).catch((err) => { });

                    clearInterval(checkInvoice);
                  }
                });
              }, 30000);
            }
          }
        });
      }
    });
  }
  async slashRun(interaction, args) {
    const config = this.client.config;
    const language = this.client.language;
    const embeds = this.client.embeds;
    const paypal = this.client.paypal;
    
    let user = interaction.options.getUser("user");
    let amount = interaction.options.getNumber("amount");
    let service = interaction.options.getString("service");
    
    if(!config.paypal.secret || !config.paypal.client_id) return interaction.reply({ embeds: [this.client.embedBuilder(this.client, interaction.user, embeds.title, language.general.paypal_cred, embeds.error_color)] });
    if(isNaN(amount)) return interaction.reply({ embeds: [this.client.utils.usage(this.client, interaction, this.client.cmdConfig.invoice.usage)] });
    
    let invoiceObject = {
      "merchant_info": {
        "email": config.paypal.mail,
        "business_name": config.paypal.title,
      },
      "items": [{
        "name": service,
        "quantity": 1.0,
        "unit_price": {
          "currency": config.general.currency,
          "value": amount
        },
      }],
      "logo_url": interaction.guild.iconURL(),
      "note": config.paypal.notes.replace("<username>", user.username)
        .replace("<userId>", user.id)
        .replace("<author>", interaction.user.username)
        .replace("<authorId>", interaction.user.id)
        .replace("<date>", new Date().toLocaleString()),
      "terms": config.paypal.tos,
      "payment_term": {
        "term_type": "NET_45"
      },
      "tax_inclusive": false,
    }
    
    const validDays = [10, 15, 30, 45, 60, 90];
    if(validDays.includes(config.paypal.days)) {
      invoiceObject.payment_term.due_type = "DUE_ON_DATE_SPECIFIED";
      invoiceObject.payment_term.due_date = "NET_" + config.paypal.days;
    } else if(!validDays.includes(config.paypal.days) && config.paypal.days > 0) {
      this.client.utils.sendError("Invalid Number of Days for PayPal Invocie specified in config.yml");
    }

    await interaction.deferReply();
    
    paypal.invoice.create(invoiceObject, (err, invoice) => {
      if (err) {
        console.log(err)
        this.client.utils.sendError("Invalid PayPal API Secret or Client ID have been provided.");
      } else {
        paypal.invoice.send(invoice.id, async function(error, rv) {
          if (err) {
            console.log(error);
          } else {
            let embed = new EmbedBuilder()
              .setColor(embeds.service.invoiceCreate.color);
            if (embeds.service.invoiceCreate.title) embed.setTitle(embeds.service.invoiceCreate.title);
    
            if (embeds.service.invoiceCreate.description) embed.setDescription(embeds.service.invoiceCreate.description.replace("<amount>", amount)
              .replace("<seller>", interaction.user)
              .replace("<invoiceId>", invoice.id)
              .replace("<user>", user)
              .replace("<mail>", config.paypal.mail)
              .replace("<currency>", config.general.currency)
              .replace("<currencySymbol>", config.general.currency_symbol)
              .replace("<service>", service));
    
            let field = embeds.service.invoiceCreate.fields;
            for (let i = 0; i < embeds.service.invoiceCreate.fields.length; i++) {
              embed.addFields([{ name: field[i].title.replace("<currency>", config.general.currency), value: field[i].description.replace("<amount>", amount)
                .replace("<seller>", interaction.user)
                .replace("<invoiceId>", invoice.id)
                .replace("<user>", user)
                .replace("<mail>", config.paypal.mail)
                .replace("<currency>", config.general.currency)
                .replace("<currencySymbol>", config.general.currency_symbol)
                .replace("<service>", service), inline: true }])
            }
    
            if (embeds.service.invoiceCreate.footer == true) embed.setFooter({ text: interaction.user.username, iconURL: interaction.user.displayAvatarURL() }).setTimestamp();
            if (embeds.service.invoiceCreate.thumbnail == true) embed.setThumbnail(interaction.user.displayAvatarURL());
    
            const row = new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                .setURL(`https://www.paypal.com/invoice/payerView/details/${invoice.id}`)
                .setLabel(language.buttons.invoice)
                .setStyle(ButtonStyle.Link),
              );
    
            interaction.followUp({ embeds: [embed], components: [row] });
            
            await db.set(`invoice_${invoice.id}`, {
              id: invoice.id,
              guild: interaction.guild.id,
              author: `${interaction.user.id}`,
              user: `${user.id}`,
              amount,
              service,
              date: new Date().toLocaleString()
            });
            
            if(config.paypal.invoice_check == true) {
              let checkInvoice = setInterval(async() => {
                paypal.invoice.get(invoice.id, function(e, invoiceData) {
                  if(invoiceData.status == "PAID" || invoiceData.status == "MARKED_AS_PAID") {
                    let invoiceEmbed = new EmbedBuilder()
                      .setColor(embeds.service.invoicePaid.color);
                    if (embeds.service.invoicePaid.title) invoiceEmbed.setTitle(embeds.service.invoicePaid.title);
                    
                    if (embeds.service.invoicePaid.description) invoiceEmbed.setDescription(embeds.service.invoicePaid.description.replace("<amount>", amount)
                      .replace("<seller>", interaction.user)
                      .replace("<invoiceId>", invoice.id)
                      .replace("<user>", user)
                      .replace("<mail>", config.paypal.mail)
                      .replace("<currency>", config.general.currency)
                      .replace("<currencySymbol>", config.general.currency_symbol)
                      .replace("<service>", service));
                    
                    let field = embeds.service.invoicePaid.fields;
                    for (let i = 0; i < embeds.service.invoicePaid.fields.length; i++) {
                      invoiceEmbed.addFields([{ name: field[i].title.replace("<currency>", config.general.currency), value: field[i].description.replace("<amount>", amount)
                        .replace("<seller>", interaction.user)
                        .replace("<invoiceId>", invoice.id)
                        .replace("<user>", user)
                        .replace("<mail>", config.paypal.mail)
                        .replace("<currency>", config.general.currency)
                        .replace("<currencySymbol>", config.general.currency_symbol)
                        .replace("<service>", service), inline: true }])
                    }
                    
                    if (embeds.service.invoicePaid.footer == true) invoiceEmbed.setFooter({ text: interaction.user.username, iconURL: interaction.user.displayAvatarURL() }).setTimestamp();
                    if (embeds.service.invoicePaid.thumbnail == true) invoiceEmbed.setThumbnail(interaction.user.displayAvatarURL());
                    interaction.channel.send({ embeds: [invoiceEmbed ]}).catch((err) => { });
                    
                    clearInterval(checkInvoice);
                  }
                });
              }, 30000);

            }
          }
        })
      }
    })
  }
};
