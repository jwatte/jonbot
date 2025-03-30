export interface SlackEventEnvelope {
    token: string;
    team_id: string;
    api_app_id: string;
    event: any;
    type: string;
    event_id: string;
    event_time: number;
    authorizations: any[];
    is_ext_shared_channel: boolean;
    event_context: string;
}

export interface AppMentionEvent extends SlackEventEnvelope {
    event: {
        type: "app_mention";
        user: string;
        text: string;
        blocks: any[];
        channel: string;
        event_ts: string;
    };
}

export interface ReactionAddedEvent extends SlackEventEnvelope {
    event: {
        type: "reaction_added";
        user: string;
        reaction: string;
        item: {
            type: string;
            channel: string;
            ts: string;
        };
        item_user: string;
        event_ts: string;
    };
}
