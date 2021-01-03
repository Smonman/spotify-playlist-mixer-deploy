let curLoggedInUser;
let curAccessToken;
let selectedPlaylistIDs = [];
let playlists = [];
let trackURIs = [];

let loadedUsers = [];

$(document).ready(function() {
    start();
    registerEvents();
});

function start(access_token_callback) {
    let navSource = document.getElementById("nav-template").innerHTML,
        navTemplate = Handlebars.compile(navSource),
        navPlaceholder = document.getElementById("nav-placeholder");

    let temp;

    let access_token;
    let refresh_token;
    let error;

    if (access_token_callback) {
        access_token = access_token_callback;
    } else {
        temp = getAccessToken();
        access_token = temp.access_token;
        refresh_token = temp.refresh_token;
        error = temp.error;
    }

    if (error) {
        alert("There was an error during the authentication");
    } else {
        if (access_token) {
            // load user
            $.ajax({
                url: "https://api.spotify.com/v1/me",
                headers: {
                    "Authorization": "Bearer " + access_token
                },
                success: function(response) {
                    curLoggedInUser = response;
                    navPlaceholder.innerHTML = navTemplate(response);
                    loadedUsers.push(response.id);
                    $("#login").hide();
                    $("#loggedin").show();

                    afterLogin(access_token);
                },
                error: function(response) {
                    if (response.status == 401) {
                        let temp = getNewAccessToken(refresh_token);
                        //console.log(temp);
                        //start(temp.access_token);
                    }
                }
            });
        } else {
            // render initial screen
            $("#login").show();
            $("#loggedin").hide();
        }

        document.getElementById("obtain-new-token").addEventListener("click", function() {
            $.ajax({
                url: "/refresh_token",
                data: {
                    "refresh_token": refresh_token
                }
            }).done(function(data) {
                access_token = data.access_token;

                curAccessToken = access_token;

                oauthPlaceholder.innerHTML = oauthTemplate({
                    access_token: access_token,
                    refresh_token: refresh_token
                });
            });
        }, false);
    }
}

function getHashParams() {
    let hashParams = {};
    let e, r = /([^&;=]+)=?([^&;]*)/g,
        q = window.location.hash.substring(1);
    while (e = r.exec(q)) {
        hashParams[e[1]] = decodeURIComponent(e[2]);
    }
    return hashParams;
}

function getAccessToken() {
    let params = getHashParams();

    let access_token = params.access_token,
        refresh_token = params.refresh_token,
        error = params.error;

    curAccessToken = access_token;

    return { access_token: access_token, refresh_token: refresh_token, error: error };
}

async function getNewAccessToken(refresh_token) {
    await $.ajax({
        url: "/refresh_token",
        data: {
            "refresh_token": refresh_token
        }
    }).done(function(data) {

        //console.log(data);

        access_token = data.access_token;
        curAccessToken = access_token;

        return { access_token: access_token }
    });
}

function registerEvents() {
    document.getElementById("search-button").addEventListener("click", function() {
        search(curAccessToken);
    });

    document.getElementById("mix-it-button").addEventListener("click", function() {
        mixIt();
    })
}

function addToSelectedPlaylistIDs(id) {
    if (!selectedPlaylistIDs.includes(id)) {
        selectedPlaylistIDs.push(id);
    }
}

function removeToSelectedPlaylistIDs(id) {
    if (selectedPlaylistIDs.includes(id)) {
        selectedPlaylistIDs.pop(id);
    }
}

async function afterLogin(access_token) {
    console.log("After login");
    let playlists = await getUserPlaylists(access_token);

    console.log("User does not have any more playlists");
    console.log("Promise resolved");

    displayPlaylists(playlists, curLoggedInUser);
}

function getUserPlaylists(access_token, url) {
    return new Promise((resolve, reject) => {
        console.log("Get User Playlists");

        if (!url) {
            url = "https://api.spotify.com/v1/me/playlists?limit=50";
        }

        let playlists = [];

        $.ajax({
            url: url,
            headers: {
                "Authorization": "Bearer " + access_token
            },
            success: async function(response) {
                for (let i = 0; i < response.items.length; i++) {
                    const playlist = response.items[i];

                    let temp = await getPlaylist(access_token, playlist.id);
                    if (temp != null) {
                        playlists.push(temp);
                    }
                }

                if (response.next) {
                    console.log("User has more playlists.");
                    let temp = await getUserPlaylists(access_token, response.next);
                    console.log("got the next user playlists");

                    if (temp != null) {
                        playlists.push(temp);
                    }
                }

                console.log("Resolving getUserPlaylists");
                resolve(playlists);
            },
            error: function(response) {
                console.log("An error occured while loading in the user playlists.");
                reject(response);
            }
        });
    })
}

function getPlaylist(access_token, id) {
    return new Promise((resolve, reject) => {
        let playlist;
        let p = $.ajax({
            url: "https://api.spotify.com/v1/playlists/" + id,
            headers: {
                "Authorization": "Bearer " + access_token
            },
            success: function(response) {
                //console.log(response);
                playlist = response;
            },
            error: function(response) {
                console.log("An error occured while loading in a playlist.");
            }
        });

        p.then((result) => {
            resolve(playlist);
        }).catch((error) => {
            console.log("An error occured while loading in a playlist.");
            reject(null);
        });
    });
}

function displayPlaylists(playlists, user) {

    console.log("Generating playlist display");

    let temp = document.createElement("template");

    let playlistContainerSource = document.getElementById("playlist-container-template").innerHTML,
        playlistContainerTemplate = Handlebars.compile(playlistContainerSource),
        playlistContainerPlaceholder = document.getElementById("playlist-container-placeholder");

    temp.innerHTML = playlistContainerTemplate({ name: user.display_name, id: user.id }).trim();
    playlistContainerPlaceholder.append(temp.content);

    let playlistSource = document.getElementById("playlist-template").innerHTML,
        playlistTemplate = Handlebars.compile(playlistSource);
    let playlistPlaceholder = document.getElementById("playlist-placeholder-" + user.id);

    for (const p of playlists) {
        p.user = user;
        temp.innerHTML = playlistTemplate(p).trim();
        playlistPlaceholder.append(temp.content);

        let cb = document.getElementById("playlist-checkbox-" + p.id + "-" + user.id);

        cb.addEventListener("click", function() {
            if (cb.checked) {
                addToSelectedPlaylistIDs(p.id);
            } else {
                removeToSelectedPlaylistIDs(p.id);
            }
        });
    }
}

async function search(access_token, url) {
    let input;
    let user;

    if (!url) {
        input = $("#search-input").val();
        $("#search-input").val("");

        if (loadedUsers.includes(input)) {
            return;
        }

        let r = new RegExp("[^:]?[a-zA-ZäöüÄÖÜß0-9._ -+]*$");

        input.trim();
        input = r.exec(input);

        console.log("search for: " + input);

        user = await getUser(access_token, input);
        console.log(user);

        if (!user) {
            return;
        }

        url = "https://api.spotify.com/v1/users/" + input + "/playlists?limit=50";
    } else {
        url = url;
    }

    let playlists = [];

    let p = $.ajax({
        url: url,
        headers: {
            "Authorization": "Bearer " + access_token
        },
        success: async function(response) {
            console.log(response);
            for (let i = 0; i < response.items.length; i++) {
                const playlist = response.items[i];

                let temp = await getPlaylist(access_token, playlist.id);
                playlists.push(temp);
            }

            if (response.next) {
                search(access_token, response.next);
            }

            console.log("Promise resolved");
            displayPlaylists(playlists, user);
        },
        error: function(response) {
            console.log("An error occured while loading in a user.");
        }
    });
}

function getUser(access_token, id) {
    return new Promise((resolve, reject) => {
        let user = null;
        let p = $.ajax({
            url: "https://api.spotify.com/v1/users/" + id,
            headers: {
                "Authorization": "Bearer " + access_token
            },
            success: function(response) {
                user = response;
                loadedUsers.push(user.id);
                //console.log(response);
            },
            error: function(response) {
                console.log("An error occured while loading in a user.");
            }
        });

        p.then((result) => {
            resolve(user);
        }).catch((error) => {});
    });
}

function getTracks(access_token, id, url) {
    return new Promise((resolve, reject) => {
        let tracks = [];

        if (!url) {
            url = "https://api.spotify.com/v1/playlists/" + id + "/tracks?fields=items(track(uri)),next";
        }

        let p = $.ajax({
            url: url,
            headers: {
                "Authorization": "Bearer " + access_token
            },
            success: async function(response) {
                console.log(response);
                for (const track of response.items) {
                    let curURI = track.track.uri;
                    if (curURI == null) {
                        continue;
                    }
                    if (!tracks.includes(curURI)) {
                        tracks.push(curURI);
                    }
                }

                if (response.next) {
                    tracks = tracks.concat(await getTracks(access_token, null, response.next));
                }

                resolve(tracks);
            },
            error: function(response) {
                console.log("An error occured while loading in a track.");
            }
        });
    });
}

function createPlaylist(access_token, options) {
    return new Promise((resolve, reject) => {
        let newPlaylist;
        let p = $.ajax({
            type: "POST",
            url: "https://api.spotify.com/v1/users/" + curLoggedInUser.id + "/playlists",
            headers: {
                "Authorization": "Bearer " + access_token
            },
            contentType: "application/json",
            dataType: "json",
            data: JSON.stringify(options),
            success: function(response) {
                console.log(response);
                newPlaylist = response;
            },
            error: function(response) {
                console.log("An error occured while creating a new playlist.");
                console.log(response);
            }
        });

        p.then((result) => {
            resolve(newPlaylist);
        }).catch((error) => {});
    });
}

function addTracksToPlaylist(access_token, id, tracks) {
    return new Promise((resolve, reject) => {

        //console.log("Add tracks: ");
        //console.log(tracks);

        let overflow = tracks.splice(100);

        //console.log("Splice:");
        //console.log(overflow);

        let uris = { uris: tracks };

        //console.log(uris);

        tracks = overflow;

        //console.log(tracks);

        let p = $.ajax({
            type: "POST",
            url: "https://api.spotify.com/v1/playlists/" + id + "/tracks",
            headers: {
                "Authorization": "Bearer " + access_token
            },
            contentType: "application/json",
            dataType: "json",
            data: JSON.stringify(uris),
            success: async function(response) {
                //console.log(response);
                if (tracks.length > 0) {
                    await addTracksToPlaylist(access_token, id, tracks);
                }

                resolve();
            },
            error: function(response) {
                console.log("An error occured while adding tracks.");
                console.log(response);
            }
        });
    });
}

async function mixIt() {

    playlists = [];
    trackURIs = [];

    let name = $("#new-playlist-name-input").val();
    let desc = $("#new-playlist-description-input").val();
    let public = $("#new-playlist-public-checkbox").checked || false;

    if (!name) {
        return;
    }

    // get selected ids
    if (selectedPlaylistIDs.length <= 0) {
        return;
    }

    for (const id of selectedPlaylistIDs) {
        playlists.push(await getPlaylist(curAccessToken, id));
    }

    console.log("finished loading in the playlists");

    for (const p of playlists) {
        trackURIs = trackURIs.concat(await getTracks(curAccessToken, p.id));
    }

    console.log("finished loading in the tracks");

    console.log(trackURIs.length);

    trackURIs = shuffle(trackURIs);

    console.log("Shuffeld the tracks");

    let newPlaylist = await createPlaylist(curAccessToken, { "name": name, "description": desc, "public": public });

    console.log("Created new playlist");


    await addTracksToPlaylist(curAccessToken, newPlaylist.id, trackURIs);

    console.log("Added tracks to the playlist");

    alert("Finished");

    //create link to open it

    let temp = document.createElement("template");
    let openPlaylistSource = document.getElementById("open-playlist-template").innerHTML,
        openPlaylistTemplate = Handlebars.compile(openPlaylistSource),
        openPlaylistPlaceholder = document.getElementById("open-playlist-placeholder");

    temp.innerHTML = openPlaylistTemplate().trim();
    openPlaylistPlaceholder.append(temp.content);

    console.log(newPlaylist);

    document.getElementById("open-playlist-button").href = newPlaylist.external_urls.spotify;
}

function shuffle(array) {
    let counter = array.length;

    // While there are elements in the array
    while (counter > 0) {
        // Pick a random index
        let index = Math.floor(Math.random() * counter);

        // Decrease counter by 1
        counter--;

        // And swap the last element with it
        let temp = array[counter];
        array[counter] = array[index];
        array[index] = temp;
    }

    return array;
}