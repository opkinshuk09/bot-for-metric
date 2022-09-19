const { QuickDB } = require("quick.db");
const db = new QuickDB();
const Event = require("../../structures/Events");

module.exports = class ChannelDelete extends Event {
	constructor(...args) {
		super(...args);
	}

	async run(channel) {
	  if(!channel.guild.members.me.permissions.has("ManageGuild")) return;
    if(!channel.guild) return;

		let dataRemove = (await db.all())
			.filter((i) => i.id.includes(channel.id));

		let dataRemoveExtra = (await db.all())
			.filter((i) => `${i.value}`.includes(channel.id));

		const commissionMsg = await db.get(`commission_${channel.id}`);
		if(commissionMsg) {
			console.log(commissionMsg)
			const commissionsChannel = this.client.utils.findChannel(channel.guild, this.client.config.channels.commissions);
			const commFetchedMsg = await commissionsChannel.messages.fetch({ message: commissionMsg.commMessageId });
			console.log(commFetchedMsg)
			if(commFetchedMsg) await commFetchedMsg.delete();
		}

		dataRemove.forEach(async(x) => await db.delete(x.id));
		dataRemoveExtra.forEach(async(x) => await db.delete(x.id));
	} 
};