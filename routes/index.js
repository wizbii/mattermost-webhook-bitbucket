var express = require('express');
var router = express.Router();
var https = require('https');
var http = require('http');
var toMarkdown = require('to-markdown');
var url = require('url');
var HttpsProxyAgent = require('https-proxy-agent');
var HttpProxyAgent = require('http-proxy-agent');

function toTitleCase(str) {
    return str.replace(/\w\S*/g, function(txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
}

function doConversion(str)
{
    return toMarkdown(str);
}

function postToServer(postContent, hookid, matterUrl) {
    console.log("Informing mattermost channel: " + hookid);
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    var agent, httpsagent, httpagent = null;
    var https_proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    var http_proxy = process.env.HTTP_PROXY || process.env.http_proxy;
    if(https_proxy)
    {
        httpsagent = new HttpsProxyAgent(https_proxy);
        console.log("Using HTTPS proxy - " + https_proxy);
    }
    if(http_proxy)
    {
        httpagent = new HttpProxyAgent(http_proxy);
        console.log("Using HTTP proxy - " + http_proxy);
    }

    var matterServer = process.env.MATTERMOST_SERVER || 'localhost';
    var matterServerPort = process.env.MATTERMOST_SERVER_PORT;
    var matterProto = process.env.MATTERMOST_SERVER_PROTO || 'http';
    var matterPath = (process.env.MATTERMOST_SERVER_PATH || '/hooks/') + hookid;
    var matterUsername = process.env.MATTERMOST_USERNAME || 'Bitbucket';
    var matterIconUrl = process.env.MATTERMOST_ICON_URL || 'https://upload.wikimedia.org/wikipedia/commons/3/32/Atlassian_Bitbucket_Logo.png';

    if(matterUrl)
    {
        try
        {
            var murl = url.parse(matterUrl);
            matterServer = murl.hostname || matterServer;
            matterServerPort = murl.port || matterServerPort;
            matterProto = murl.protocol.replace(":","") || matterProto;
            matterPath = murl.pathname || matterPath;
        }
        catch(err){console.log(err)}
    }
    //If the port is not initialized yet (neither from env, nor from query param)
    // use the defaults ports
    if(!matterServerPort)
    {
        if (matterProto == 'https')
        {
            matterServerPort = '443';
        }
        else
        {
            matterServerPort = '80';
        }
    }
    console.log(matterServer + "-" + matterServerPort  + "-" + matterProto);
    var proto;
    if(matterProto == 'https')
    {
        console.log("Using https protocol");
        proto = https;
        agent = httpsagent;
    }
    else
    {
        console.log("Using http protocol");
        proto = http;
        agent = httpagent;
    }

    var postData = '{"text": ' + JSON.stringify(postContent) + ', "username": "' + matterUsername + '", "icon_url": "' + matterIconUrl + '"}';
    console.log(postData);

    var post_options = {
        host: matterServer,
        port: matterServerPort,
        path: matterPath,
        method: 'POST',
        agent: agent,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    console.log(post_options);

    try
    {
        // Set up the request
        var post_req = proto.request(post_options, function(res) {
            res.setEncoding('utf8');
            res.on('data', function(chunk) {
                console.log('Response: ' + chunk);
            });
            res.on('error', function(err) {
                console.log('Error: ' + err);
            });
        });

        // post the data
        post_req.write(postData);
        post_req.end();
    }
    catch(err)
    {
        console.log("Unable to reach mattermost server: " + err);
    }
}

router.post('/hooks/:hookid', function(req, res, next) {
    console.log("Received update from Bitbucket");
    console.log(req.body.repository.full_name);
    var hookId = req.params.hookid;
    var actor = req.body.actor.display_name;
    var repository = req.body.repository.full_name;
    var change = req.body.push.changes[0];
    var postContent = "";

    if (change.commits.length > 1) {
      postContent += "[" + repository + "/" + change.new.name + "] " + change.commits.length + " new commits:\n";
    }
    change.commits.forEach(function(commit) {
      postContent += "[" + repository + "/" + change.new.name + "] ";
      postContent += "[" + commit.hash.substr(0, 12) + "](" + commit.links.html.href + ") (" + actor + "): ";
      postContent += commit.message;
    });

    console.log(postContent);

    var matterUrl = req.query.matterurl;

    postToServer(postContent, hookId, matterUrl);

    res.render('index', {
        title: 'Bitbucket Mattermost Bridge - beauty, posted to Bitbucket'
    });
});


module.exports = router;
