// Add to channel:
// 2025-02-28T02:59:10.661Z event: http://jonbot.in-reve.com/jonbot/event payload:
export const ADD_TO_CHANNEL = {
    token: "rkrjDvuNJazUKAXQUBPQFADq",
    team_id: "T06FS1Z8BE1",
    api_app_id: "A08FSLM1BUH",
    event: {
        user: "U06RKTYJ215",
        type: "app_mention",
        ts: "1740711540.582689",
        client_msg_id: "8c8f6b1f-37e4-4526-a81c-3ae72bf903b3",
        text: "<@U08FSM3AF25> hello",
        team: "T06FS1Z8BE1",
        blocks: [
            {
                type: "rich_text",
                block_id: "b6ASY",
                elements: [
                    {
                        type: "rich_text_section",
                        elements: [
                            {
                                type: "user",
                                user_id: "U08FSM3AF25",
                            },
                            {
                                type: "text",
                                text: " hello",
                            },
                        ],
                    },
                ],
            },
        ],
        channel: "C08FDD1VAN9",
        event_ts: "1740711540.582689",
    },
    type: "event_callback",
    event_id: "Ev08FG0UMWLT",
    event_time: 1740711540,
    authorizations: [
        {
            enterprise_id: null,
            team_id: "T06FS1Z8BE1",
            user_id: "U08FSM3AF25",
            is_bot: true,
            is_enterprise_install: false,
        },
    ],
    is_ext_shared_channel: false,
    event_context:
        "4-eyJldCI6ImFwcF9tZW50aW9uIiwidGlkIjoiVDA2RlMxWjhCRTEiLCJhaWQiOiJBMDhGU0xNMUJVSCIsImNpZCI6IkMwOEZERDFWQU45In0",
};

// Add emoji:
// 2025-02-28T03:00:06.604Z event: http://jonbot.in-reve.com/jonbot/event payload:
export const ADD_EMOJI = {
    token: "rkrjDvuNJazUKAXQUBPQFADq",
    team_id: "T06FS1Z8BE1",
    context_team_id: "T06FS1Z8BE1",
    context_enterprise_id: null,
    api_app_id: "A08FSLM1BUH",
    event: {
        type: "reaction_added",
        user: "U06RKTYJ215",
        reaction: "robot_face",
        item: {
            type: "message",
            channel: "C08FDD1VAN9",
            ts: "1740711601.736419",
        },
        item_user: "U06RKTYJ215",
        event_ts: "1740711606.000300",
    },
    type: "event_callback",
    event_id: "Ev08F8KG28RL",
    event_time: 1740711606,
    authorizations: [
        {
            enterprise_id: null,
            team_id: "T06FS1Z8BE1",
            user_id: "U08FSM3AF25",
            is_bot: true,
            is_enterprise_install: false,
        },
    ],
    is_ext_shared_channel: false,
    event_context:
        "4-eyJldCI6InJlYWN0aW9uX2FkZGVkIiwidGlkIjoiVDA2RlMxWjhCRTEiLCJhaWQiOiJBMDhGU0xNMUJVSCIsImNpZCI6IkMwOEZERDFWQU45In0",
};

// Mention bot:
// 2025-02-28T03:00:40.704Z event: http://jonbot.in-reve.com/jonbot/event payload:
export const MENTION_BOT = {
    token: "rkrjDvuNJazUKAXQUBPQFADq",
    team_id: "T06FS1Z8BE1",
    api_app_id: "A08FSLM1BUH",
    event: {
        user: "U06RKTYJ215",
        type: "app_mention",
        ts: "1740711638.296199",
        client_msg_id: "6643ff8e-f4ab-4e39-80ab-65d071fdc56b",
        text: "Hello <@U08FSM3AF25>",
        team: "T06FS1Z8BE1",
        blocks: [
            {
                type: "rich_text",
                block_id: "Qc4XW",
                elements: [
                    {
                        type: "rich_text_section",
                        elements: [
                            {
                                type: "text",
                                text: "Hello ",
                            },
                            {
                                type: "user",
                                user_id: "U08FSM3AF25",
                            },
                        ],
                    },
                ],
            },
        ],
        channel: "C08FDD1VAN9",
        event_ts: "1740711638.296199",
    },
    type: "event_callback",
    event_id: "Ev08FDDB60UV",
    event_time: 1740711638,
    authorizations: [
        {
            enterprise_id: null,
            team_id: "T06FS1Z8BE1",
            user_id: "U08FSM3AF25",
            is_bot: true,
            is_enterprise_install: false,
        },
    ],
    is_ext_shared_channel: false,
    event_context:
        "4-eyJldCI6ImFwcF9tZW50aW9uIiwidGlkIjoiVDA2RlMxWjhCRTEiLCJhaWQiOiJBMDhGU0xNMUJVSCIsImNpZCI6IkMwOEZERDFWQU45In0",
};

// Slash command:
// 2025-02-28T02:57:28.603Z command: http://jonbot.in-reve.com/jonbot/command payload:
export const SLASH_COMMAND = {
    token: "rkrjDvuNJazUKAXQUBPQFADq",
    team_id: "T06FS1Z8BE1",
    team_domain: "reveai",
    channel_id: "D06SD53QN3T",
    channel_name: "directmessage",
    user_id: "U06RKTYJ215",
    user_name: "jwatte",
    command: "/jonbot",
    text: "hello",
    api_app_id: "A08FSLM1BUH",
    is_enterprise_install: "false",
    response_url:
        "https://hooks.slack.com/commands/T06FS1Z8BE1/8523439504549/u9DonfdagZXXJFppn6ADrTXj",
    trigger_id: "8523439504709.6536067283477.13e1ac64824737358fe2b8ff9a08c08e",
};
