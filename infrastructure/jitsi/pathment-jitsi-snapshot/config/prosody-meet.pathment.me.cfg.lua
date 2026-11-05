-- We need this for prosody 13.0
component_admins_as_room_owners = true

plugin_paths = { "/usr/share/jitsi-meet/prosody-plugins/" }

-- domain mapper options, must at least have domain base set to use the mapper
muc_mapper_domain_base = "meet.pathment.me";

external_service_secret = "REPLACE_AT_INSTALL";
external_services = {
     { type = "stun", host = "meet.pathment.me", port = 3478 },
     { type = "turn", host = "meet.pathment.me", port = 3478, transport = "udp", secret = true, ttl = 86400, algorithm = "turn" },
     { type = "turns", host = "meet.pathment.me", port = 5349, transport = "tcp", secret = true, ttl = 86400, algorithm = "turn" }
};

cross_domain_bosh = false;
consider_bosh_secure = true;
consider_websocket_secure = true;
-- https_ports = { }; -- Remove this line to prevent listening on port 5284

-- by default prosody 0.12 sends cors headers, if you want to disable it uncomment the following (the config is available on 0.12.1)
--http_cors_override = {
--    bosh = {
--        enabled = false;
--    };
--    websocket = {
--        enabled = false;
--    };
--}

-- https://ssl-config.mozilla.org/#server=haproxy&version=2.1&config=intermediate&openssl=1.1.0g&guideline=5.4
ssl = {
    protocol = "tlsv1_2+";
    ciphers = "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384"
}

unlimited_jids = {
    "focus@auth.meet.pathment.me",
    "jvb@auth.meet.pathment.me"
}

-- https://prosody.im/doc/modules/mod_smacks
smacks_max_unacked_stanzas = 5;
smacks_hibernation_time = 60;
smacks_max_old_sessions = 1;

VirtualHost "meet.pathment.me"
    authentication = "internal_hashed"
    -- Properties below are modified by jitsi-meet-tokens package config
    -- and authentication above is switched to "token"
    --app_id="example_app_id"
    --app_secret="REPLACE_AT_INSTALL"
    -- Assign this host a certificate for TLS, otherwise it would use the one
    -- set in the global section (if any).
    -- Note that old-style SSL on port 5223 only supports one certificate, and will always
    -- use the global one.
    ssl = {
        key = "/etc/prosody/certs/meet.pathment.me.key";
        certificate = "/etc/prosody/certs/meet.pathment.me.crt";
    }
    -- we need bosh
    modules_enabled = {
        "bosh";
        "websocket";
        "smacks";
        "ping"; -- Enable mod_ping
        "external_services";
        "features_identity";
        "conference_duration";
        "muc_lobby_rooms";
        "muc_breakout_rooms";
    }
    c2s_require_encryption = false
    lobby_muc = "lobby.meet.pathment.me"
    breakout_rooms_muc = "breakout.meet.pathment.me"
    main_muc = "conference.meet.pathment.me"
    -- muc_lobby_whitelist = { "recorder.meet.pathment.me" } -- Here we can whitelist jibri to enter lobby enabled rooms

VirtualHost "guest.meet.pathment.me"
    authentication = "jitsi-anonymous"
    c2s_require_encryption = false

Component "conference.meet.pathment.me" "muc"
    restrict_room_creation = true
    storage = "memory"
    modules_enabled = {
        "muc_hide_all";
        "muc_meeting_id";
        "muc_domain_mapper";
        --"token_verification";
        "muc_rate_limit";
        "muc_password_whitelist";
    }
    admins = { "focus@auth.meet.pathment.me" }
    muc_password_whitelist = {
        "focus@auth.meet.pathment.me"
    }
    muc_room_locking = false
    muc_room_default_public_jids = true

Component "breakout.meet.pathment.me" "muc"
    restrict_room_creation = true
    storage = "memory"
    modules_enabled = {
        "muc_hide_all";
        "muc_meeting_id";
        "muc_domain_mapper";
        "muc_rate_limit";
        --"polls";
    }
    admins = { "focus@auth.meet.pathment.me" }
    muc_room_locking = false
    muc_room_default_public_jids = true

-- internal muc component
Component "internal.auth.meet.pathment.me" "muc"
    storage = "memory"
    modules_enabled = {
        "muc_hide_all";
        "ping";
    }
    admins = { "focus@auth.meet.pathment.me", "jvb@auth.meet.pathment.me" }
    muc_room_locking = false
    muc_room_default_public_jids = true

VirtualHost "auth.meet.pathment.me"
    ssl = {
        key = "/etc/prosody/certs/auth.meet.pathment.me.key";
        certificate = "/etc/prosody/certs/auth.meet.pathment.me.crt";
    }
    modules_enabled = {
        "limits_exception";
        "smacks";
    }
    authentication = "internal_hashed"
    smacks_hibernation_time = 15;

VirtualHost "recorder.meet.pathment.me"
    modules_enabled = {
      "smacks";
    }
    authentication = "internal_hashed"
    smacks_max_old_sessions = 2000;

-- Proxy to jicofo's user JID, so that it doesn't have to register as a component.
Component "focus.meet.pathment.me" "client_proxy"
    target_address = "focus@auth.meet.pathment.me"

Component "speakerstats.meet.pathment.me" "speakerstats_component"
    muc_component = "conference.meet.pathment.me"

Component "endconference.meet.pathment.me" "end_conference"
    muc_component = "conference.meet.pathment.me"

Component "avmoderation.meet.pathment.me" "av_moderation_component"
    muc_component = "conference.meet.pathment.me"

Component "filesharing.meet.pathment.me" "filesharing_component"
    muc_component = "conference.meet.pathment.me"

Component "lobby.meet.pathment.me" "muc"
    storage = "memory"
    restrict_room_creation = true
    muc_room_locking = false
    muc_room_default_public_jids = true
    modules_enabled = {
        "muc_hide_all";
        "muc_rate_limit";
    }

Component "metadata.meet.pathment.me" "room_metadata_component"
    muc_component = "conference.meet.pathment.me"
    breakout_rooms_component = "breakout.meet.pathment.me"

Component "polls.meet.pathment.me" "polls_component"
