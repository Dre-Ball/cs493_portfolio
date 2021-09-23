'use strict';

const express = require('express');
const app = express();
const path = require(`path`);
const fetch = require('node-fetch');

const {Datastore} = require('@google-cloud/datastore');
const bodyParser = require('body-parser');
const { entity } = require('@google-cloud/datastore/build/src/entity');
const request = require('request');

const datastore = new Datastore();

const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const jwt_decode = require('jwt-decode');

const USER = "User";
const BOAT = "Boat";
const LOAD = "Load";

const router = express.Router();
const login = express.Router();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.enable('trust proxy');

function fromDatastore(item) {
    item.id = item[Datastore.KEY].id;
    return item;
}

const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://ballesta-project.us.auth0.com/.well-known/jwks.json`
    }),
  
    // Validate the audience and the issuer.
    issuer: `https://ballesta-project.us.auth0.com/`,
    algorithms: ['RS256']
  });


/* ------------ Begin Model Functions ----------- */


/* -------- BOAT ------- */
// GET one boat
function get_boat(id) {
    const q = datastore.createQuery(BOAT).filter('__key__', '=', datastore.key([BOAT, parseInt(id, 10)]));
    return datastore.runQuery(q)
    .then( entity => {
        return entity[0].map(fromDatastore);
    });
};


// GET all user boats
function get_userBoats(req, id) {
    let q = datastore.createQuery(BOAT).filter('owner','=',id).limit(5);
    let p = datastore.createQuery(BOAT).filter('owner','=',id);
    const results = {};
    if (Object.keys(req.query).includes("cursor")) {
        q = q.start(req.query.cursor);
    }
    return datastore.runQuery(q).then( (entities) => {
        results.items = entities[0].map(fromDatastore);
        console.log()
        if ( entities[1].moreResults !== Datastore.NO_MORE_RESULTS ) {
            results.next = req.protocol + "://" + req.get("host") + req.originalUrl + "?cursor=" + entities[1].endCursor;
        }
        return datastore.runQuery(p).then( (entities) => {
            results.total = entities[0].length;
            return results
        })
    });
};


// GET all boats
function get_allBoats(req){
let q = datastore.createQuery(BOAT).limit(5);
let p = datastore.createQuery(BOAT);
const results = {};
if (Object.keys(req.query).includes("cursor")) {
    q = q.start(req.query.cursor);
}
return datastore.runQuery(q).then( (entities) => {
    results.items = entities[0].map(fromDatastore);
    console.log()
    if ( entities[1].moreResults !== Datastore.NO_MORE_RESULTS ) {
        results.next = req.protocol + "://" + req.get("host") + req.originalUrl + "?cursor=" + entities[1].endCursor;
    }
    return datastore.runQuery(p).then( (entities) => {
        results.total = entities[0].length;
        return results
    })
});
};

// POST boat
function post_boat(name, type, length, req) {
    const key = datastore.key(BOAT);
    const new_boat = {"name": name, "type": type, "length": length, "owner": req.user.sub};
    const entity = {
        "key": key,
        "data": new_boat,
    };
    return datastore.insert(entity).then(() => {return entity} );
};


// create user_id 
function new_user(req){
    let q = datastore.createQuery(USER).filter('user_id','=',req.user.sub)
    datastore.runQuery(q).then( user => {
        console.log(user)
        if ( user[0].length === 0 ) {
            console.log('reaching')
            const userKey = datastore.key(USER);
            const new_user = {"user_id": req.user.sub};
            const userEntity = {
                "key": userKey,
                "data": new_user,
            };
            return datastore.insert(userEntity);
        } 
    });
}


// PUT boat
function put_boat(id, name, type, length, loads, req) {
    const key = datastore.key([BOAT, parseInt(id,10)]);
    const boat = {"name": name, "type": type, "length": length, "loads": loads, "owner": req.user.sub};
    const entity = {
        "key": key,
        "data": boat
    };
    return datastore.save(entity).then(() => {return entity} );
};


// PATCH boat
function patch_boat(id, name, type, length, loads, req) {
    const key = datastore.key([BOAT, parseInt(id,10)]);
    const boat = {"name": name, "type": type, "length": length, loads, "owner": req.user.sub};
    const entity = {
        "key": key,
        "data": boat
    };
    return datastore.save(entity).then(() => {return entity} );
};


// DELETE boat
function delete_boat(id){
    const key = datastore.key([BOAT, parseInt(id,10)]);
    const loadQuery = datastore.createQuery(LOAD).filter('carrier', '=', id);
    let runLoadQuery = datastore.runQuery(loadQuery)
    return runLoadQuery.then( (loads) => {
        // delete
        datastore.delete(key); 
        for ( let load of loads[0] ) {
            // get load key 
            let loadKey = load[datastore.KEY]
            let getLoadKey = datastore.key([LOAD, parseInt(loadKey.id,10)])
            return datastore.get(getLoadKey)
            .then( (load) => {
                if ( load[0].carrier === id ){
                    load[0].carrier = null
                }
                return datastore.save({"key": getLoadKey, "data": load[0]})
            })
        }
    })
};


/* ------ LOAD ------- */
// GET a load
function get_load(id) {
    const q = datastore.createQuery(LOAD).filter('__key__', '=', datastore.key([LOAD, parseInt(id, 10)]));
    return datastore.runQuery(q)
    .then( entity => {
        return entity[0].map(fromDatastore);
    });
};


// GET all loads
function get_loads(req) {
    let q = datastore.createQuery(LOAD).limit(5);
    let p = datastore.createQuery(LOAD);
    const results = {};
    if (Object.keys(req.query).includes("cursor")) {
        q = q.start(req.query.cursor);
    }
    return datastore.runQuery(q).then( (entities) => {
        results.items = entities[0].map(fromDatastore);
        if (entities[1].moreResults !== Datastore.NO_MORE_RESULTS ) {
            results.next = req.protocol + "://" + req.get("host") + req.originalUrl + "?cursor=" + entities[1].endCursor;
        }
        return datastore.runQuery(p).then( (entities) => {
            results.total = entities[0].length;
            return results
        });
    });
};


// POST load
function post_load(volume, content, year) {
    const key = datastore.key(LOAD);
    const new_load = {"volume": volume, "content": content, "year": year};
    const entity = {
        "key": key,
        "data": new_load,
    };
    return datastore.insert(entity).then(() => {return entity} );
};


// PUT loads
function put_loads(id, volume, content, year, carrier) {
    const key = datastore.key([LOAD, parseInt(id,10)]);
    const load = {"volume": volume, "content": content, "year": year, "carrier": carrier};
    const entity = {
        "key": key,
        "data": load
    };
    return datastore.save(entity).then(() => {return entity} );
};


// PATCH load
function patch_load(id, volume, content, year, carrier) {
    const key = datastore.key([LOAD, parseInt(id,10)]);
    const load = {"volume": volume, "content": content, "year": year, carrier};
    const entity = {
        "key": key,
        "data": load
    };
    return datastore.save(entity).then(() => {return entity} );
};


// DELETE load
function delete_load(id){
    const key = datastore.key([LOAD, parseInt(id,10)]);
    const boatQuery = datastore.createQuery(BOAT).filter('loads', '=', id);
    let runBoatQuery = datastore.runQuery(boatQuery);
    
    return runBoatQuery.then( (boats) => {
        // delete
        datastore.delete(key);
        for ( let boat of boats[0] ){
            //get boat key
            let boatKey = boat[datastore.KEY]
            let getBoatKey = datastore.key([BOAT, parseInt(boatKey.id,10)]);
            return datastore.get(getBoatKey)
            .then( (boat) => {
                // if load_id exists, remove
                if ( boat[0].loads.includes(id)) {
                    let index = boat[0].loads.indexOf(id);
                    const removedIndex = boat[0].loads.splice(index, 1)
                    // check if empty array after removal
                    if ( boat[0].loads.length === 0 ) {
                        boat[0].loads = null;
                    } else {
                        // save
                        return datastore.save({"key": getBoatKey, "data": boat[0]});
                    }
                }
                // save
                return datastore.save({"key": getBoatKey, "data": boat[0]})
            })
        }
    })
};


/* -------- USERS --------- */
// GET all users
function get_users() {
    const q = datastore.createQuery(USER);
    return datastore.runQuery(q).then( entity => {
        return entity[0].map(fromDatastore);
    });
};



/* -------- ASSIGN LOAD TO BOAT -------- */
// PUT load into a boat
function put_load(boat_id, load_id) {
    const boatKey = datastore.key([BOAT, parseInt(boat_id,10)]);
    const loadKey = datastore.key([LOAD, parseInt(load_id,10)]);
    return datastore.get(boatKey)
    .then( (boat) => {
        // loads is undefined
        console.log(boat)
        if ( typeof(boat[0].loads) === 'undefined' ) {
            boat[0].loads = [];
        } else {
            // loads is null
            if ( boat[0].loads === null ) {
                boat[0].loads = [];
            } 
            boat[0].loads.push(load_id);
            return datastore.get(loadKey)
            .then( (load) => {
                // carrier is null
                if ( load[0].carrier === null ) {
                    load[0].carrier = boat_id;
                } else {
                    // carrier is undefined
                    if ( typeof(load[0].carrier) === 'undefined' ) {
                        load[0].carrier = boat_id;
                    }
                    // save
                    return datastore.save({"key": boatKey, "data": boat[0]})
                    .then(datastore.save({"key": loadKey, "data": load[0]}));                        
                    };
                // save
                return datastore.save({"key": boatKey, "data": boat[0]})
                .then(datastore.save({"key": loadKey, "data": load[0]}));                   
                });
            };
        boat[0].loads.push(load_id);
        return datastore.get(loadKey)
        .then( (load) => {
            // carrier is undefined
            if ( typeof(load[0].carrier) === 'undefined' ) {
                load[0].carrier = boat_id
            } else {
                // carrier is null
                if ( load[0].carrier === null) {
                    load[0].carrier = boat_id;
                }
                // save
                return datastore.save({"key": boatKey, "data": boat[0]})
                .then(datastore.save({"key": loadKey, "data": load[0]}));
            }
            // save
            return datastore.save({"key": boatKey, "data": boat[0]})
            .then(datastore.save({"key": loadKey, "data": load[0]}));
        })
    });
}


/* -------- REMOVE LOAD FROM A BOAT --------- */
// DELETE load from a boat
function delete_loadFromBoat(boat_id, load_id){
    const loadKey = datastore.key([LOAD, parseInt(load_id,10)]);
    const boatKey = datastore.key([BOAT, parseInt(boat_id,10)]);
    return datastore.get(loadKey)
    .then( (load) => {
        if ( load[0].carrier === boat_id ) {
            load[0].carrier = null;
        }
        return datastore.get(boatKey)
        .then ( (boat) => {
            if ( boat[0].loads[0].includes(load_id) ) {
                boat[0].loads = null;
            }
            return datastore.save({"key":loadKey, "data":load[0]})
            .then(datastore.save({"key":boatKey, "data":boat[0]}));
        });
    });
};








/* ------------------------- Begin Controller Functions --------------------------- */
/* ----------- BOAT ----------- */
// GET all boats
router.get(
    '/boats', 
    checkJwt,
    // if invalid/no JWT
    (err, req, res, next) => {
    if (err) {
        const boats = get_allBoats(req)
        .then( boats => {
            res.status(200).json(boats);
            })
        }    
    },
    // valid JWT
    function(req, res){
    const boats = get_userBoats(req, req.user.sub)
    .then( (boats) => {
        boats.items.forEach( boat => {
            let self = req.protocol + '://' + req.get('host') + req.baseUrl + '/' + boat.id;
            let getUrl = {self};
            let urlBoat = Object.assign(boat, getUrl)  
            });
        res.status(200).json(boats)
    });
});


// GET one boat
router.get('/boats/:boat_id', checkJwt, (req, res) => {
    let self = req.protocol + '://' + req.get('host') + req.originalUrl;
    const id = req.params.boat_id;
    get_boat(id)
    .then( boat => {
        const accepts = req.accepts(['application/json']);
        // if application/json or text/html
        if(!accepts){
            res.status(406).send({"Error": "Not Acceptable. Only application/json available"});
        // application/json
        } else if(accepts === 'application/json'){
            if ( typeof(boat[0].loads) === 'undefined') {
                // boat self url
                let getUrl = {self};
                let urlBoat = Object.assign(boat[0], getUrl);
                res.status(200).json(urlBoat);            
            } else {
                if ( boat[0].loads === null ) {
                    // boat self url
                    let getUrl = {self};
                    let urlBoat = Object.assign(boat[0], getUrl);
                    res.status(200).json(urlBoat);           
                } else {
                    // loads self url
                    let loadSelf = req.protocol + '://' + req.get('host') + '/loads/' + boat[0].loads[0];
                    let loadUrl = { "id": boat[0].loads[0], "self": loadSelf,}
                    // boat self url
                    //urlBoat = Object.assign(boat[0], getUrl);
                    res.status(200).json({
                        "name": boat[0].name,
                        "type": boat[0].type,
                        "length": boat[0].length,
                        "loads": loadUrl,
                        "id": boat[0].id,
                        "self": self
                    })
                } 
            }      
        }
    })
    .catch(err => {
        console.log(err);
        res.status(404).send({
            "Error": "No boat with this boat_id exists"
        });
    }); 
});
    

// POST boat
router.post('/boats', checkJwt, function(req, res) {
    let fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    if (req.body.name && req.body.type && req.body.length) {
        new_user(req);
        post_boat(req.body.name, req.body.type, req.body.length, req)
        .then( entity => {res.status(201).json({
            "id": entity.key.id,
            "name": entity.data.name,
            "type": entity.data.type,
            "length": entity.data.length,
            "owner": req.user.sub,
            "self": fullUrl + '/' + entity.key.id
        });
      });
    } else {
        res.status(400).send({
            "Error": "The request object is missing at least one of the required attributes"
        });
    };
});


// PUT boat update
router.put('/boats/:boat_id', checkJwt, function(req, res) {
    let fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    const boatQuery = datastore.createQuery(BOAT).filter('__key__', '=', datastore.key([BOAT, parseInt(req.params.boat_id,10)]))
    .filter('owner','=',req.user.sub);
    const runBoatQuery = datastore.runQuery(boatQuery);

    return runBoatQuery.then( (boat) => {
        // Valid JWT, but boat_id is owned by someone else
        // or boat_id does not exist
        if (boat[0].length === 0 ){
            res.status(403).send({
                "Error": "No boat with this boat_id exists or boat_id is owned by someone else"
            });
        } else {
            let loads = boat[0][0].loads
            if (req.body.name && req.body.type && req.body.length) {
                put_boat(req.params.boat_id, req.body.name, req.body.type, req.body.length, loads, req)
                .then( entity => {res.status(200).json({
                    "id": entity.key.id,
                    "name": entity.data.name,
                    "type": entity.data.type,
                    "length": entity.data.length,
                    "loads": loads,
                    "owner": req.user.sub,
                    "self": fullUrl  
                });
            });
            } else {
                res.status(400).send({
                    "Error": "The request object is missing at least one of the required attributes"
                });
            };
        };
    });
});


// PATCH all boats
// RETURN ERROR
router.patch('/boats', checkJwt, function(req, res){
    res.set('Accept', 'POST');
    res.status(405).send({"Error": "Method not allowed. See Accept Header"})
});


// PATCH boat update
router.patch('/boats/:boat_id', checkJwt, function(req, res) {
    if(req.get('content-type') !== 'application/json'){
        res.status(415).send({"Error": "Server only accepts application/json data."})
    } else {
        let fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
        const boatQuery = datastore.createQuery(BOAT).filter('__key__', '=', datastore.key([BOAT, parseInt(req.params.boat_id,10)])).filter('owner','=',req.user.sub);
        const runBoatQuery = datastore.runQuery(boatQuery);
        
        // check if array empty
        return runBoatQuery.then( (boat) => {
            // Valid JWT, but boat_id is owned by someone else
            // or boat_id does not exist
            if (boat[0].length === 0 ){
                res.status(403).send({
                    "Error": "No boat with this boat_id exists or boat_id is owned by someone else"
                });
            } else {
                // valid name
                let loads = boat[0][0].loads
                if (req.body.name) {
                    patch_boat(req.params.boat_id, req.body.name, boat[0][0].type, boat[0][0].length, loads, req)
                    .then( entity => {
                        res.set('Content-Type', 'application/json');
                        res.set("Location", req.protocol + "://" + req.get('host') + req.originalUrl);
                        res.status(200).json({
                        "id": entity.key.id,
                        "name": entity.data.name,
                        "type": entity.data.type,
                        "length": entity.data.length,
                        "loads": loads,
                        "owner": req.user.sub,
                        "self": fullUrl  
                    });
                });
                } else {
                    // valid type
                    let loads = boat[0][0].loads
                    if (req.body.type) {
                        patch_boat(req.params.boat_id, boat[0][0].name, req.body.type, boat[0][0].length, loads, req)
                        .then( entity => {
                            res.set('Content-Type', 'application/json');
                            res.set("Location", req.protocol + "://" + req.get('host') + req.originalUrl);
                            res.status(200).json({
                            "id": entity.key.id,
                            "name": entity.data.name,
                            "type": entity.data.type,
                            "length": entity.data.length,
                            "loads": loads,
                            "owner": req.user.sub,
                            "self": fullUrl     
                            })
                        })
                    } else {
                        // valid length
                        let loads = boat[0][0].loads
                        if ( req.body.length) {
                            patch_boat(req.params.boat_id, boat[0][0].name, boat[0][0].type, req.body.length, loads, req)
                            .then( entity => {
                                res.set('Content-Type', 'application/json');
                                res.set("Location", req.protocol + "://" + req.get('host') + req.originalUrl);
                                res.status(200).json({
                                "id": entity.key.id,
                                "name": entity.data.name,
                                "type": entity.data.type,
                                "length": entity.data.length,
                                "loads": loads,
                                "owner": req.user.sub,
                                "self": fullUrl       
                                })
                            })
                        } else {
                            res.status(400).send({
                                "Error": "The request object is missing at least one of the required attributes"
                            });
                        };
                    } 
                } 
            };
        });
    }   
});


// DELETE boat 
router.delete('/boats/:boat_id', checkJwt, function(req, res){
    const boatQuery = datastore.createQuery(BOAT).filter('__key__', '=', datastore.key([BOAT, parseInt(req.params.boat_id,10)]))
    .filter('owner','=',req.user.sub);
    const runBoatQuery = datastore.runQuery(boatQuery)
    
    return runBoatQuery.then ( (boat) => {
        // Valid JWT, but boat_id is owned by someone else
        // or boat_id does not exist
        if ( boat[0].length === 0 ) {
            res.status(403).send({
                "Error": "No boat with this boat_id exists or boat_id is owned by someone else"
            })
        } else {
            // Delete if owner and boat_id exists
            delete_boat(req.params.boat_id).then(res.status(204).end());
        };
    });
});


/* ------------------ LOAD ----------------- */
// GET all loads
router.get('/loads', function(req, res){
    const loads = get_loads(req)
    .then( (loads) => {
        loads.items.forEach( load => {
            let self = req.protocol + "://" + req.get('host') + req.baseUrl + '/' + load.id;
            let getUrl = {self};
            let urlLoad = Object.assign(load, getUrl)
        });
        res.status(200).json(loads);
    });
});


// GET one load
router.get('/loads/:load_id', (req, res) => {
    let self = req.protocol + '://' + req.get('host') + req.originalUrl;
    const id = req.params.load_id
    get_load(id)
    .then( load => {
        const accepts = req.accepts(['application/json']);
        // if application/json or text/html
        if(!accepts){
            res.status(406).send({"Error": "Not Acceptable. Only application/json available"});
        // application/json
        } else if(accepts === 'application/json'){
            if ( typeof(load[0].carrier)  === 'undefined' ) {
                // load self url
                let getUrl = {self};
                let urlLoad = Object.assign(load[0], getUrl);
                res.status(200).json(urlLoad);            
            } else {
                if ( load[0].carrier === null ) {
                    // load self url
                    let getUrl = {self};
                    let urlLoad = Object.assign(load[0], getUrl);
                    res.status(200).json(urlLoad);
                } else { 
                    // carrier self url
                    let boatSelf = req.protocol + '://' + req.get('host') + '/boats/' + load[0].carrier;
                    let boatUrl = {"id": load[0].carrier, "self": boatSelf}
                    // load self url
                    let getUrl = {self};
                    //urlLoad = Object.assign(load[0], getUrl);
                    res.status(200).json({
                        "id": load[0].id,
                        "content": load[0].content,
                        "volume": load[0].volume,
                        "carrier": boatUrl,
                        "self": self
                    });
                }
            }
        }
    })
    .catch(err => {
        console.log(err);
        res.status(404).send({
            "Error": "No load with this load_id exists"
        });
    }); 
});
    

// POST loads
router.post('/loads', function(req, res) {
    let fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    if (req.body.volume && req.body.content) {
        post_load(req.body.volume, req.body.content, req.body.year)
        .then( entity => {res.status(201).json({
            "id": entity.key.id,
            "volume": entity.data.volume,
            "content": entity.data.content,
            "year": entity.data.year,
            "self": fullUrl + '/' + entity.key.id
        });
      });
    } else {
        res.status(400).send({
            "Error": "The request object is missing the required volume or content"
        });
    };
});


// PUT loads update
router.put('/loads/:load_id', function(req, res) {
    let fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    const loadQuery = datastore.createQuery(LOAD).filter('__key__', '=', datastore.key([LOAD, parseInt(req.params.load_id,10)]));
    const runLoadQuery = datastore.runQuery(loadQuery);
    return runLoadQuery.then( (load) => {
        if (load[0].length === 0 ){
            res.status(404).send({
                "Error": "No load with this load_id exists"
            });
        } else {
            let carrier = load[0][0].carrier
            if (req.body.volume && req.body.content && req.body.year) {
                put_loads(req.params.load_id, req.body.volume, req.body.content, req.body.year, carrier)
                .then( entity => {res.status(200).json({
                    "id": entity.key.id,
                    "volume": entity.data.volume,
                    "content": entity.data.content,
                    "year": entity.data.year,
                    "carrier": carrier,
                    "self": fullUrl  
                });
            });
            } else {
                res.status(400).send({
                    "Error": "The request object is missing at least one of the required attributes"
                });
            };
        };
    });
});


// PATCH all loads
// RETURN ERROR
router.patch('/loads', function(req, res){
    res.set('Accept', 'POST');
    res.status(405).send({"Error": "Method not allowed. See Accept Header"})
});


// PATCH load update
router.patch('/loads/:load_id', function(req, res) {
    if(req.get('content-type') !== 'application/json'){
        res.status(415).send({"Error": "Server only accepts application/json data."})
    } else {
        let fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
        const loadQuery = datastore.createQuery(LOAD).filter('__key__', '=', datastore.key([LOAD, parseInt(req.params.load_id,10)]));
        const runLoadQuery = datastore.runQuery(loadQuery);
        
    
        // check if array empty
        return runLoadQuery.then( (load) => {
            if (load[0].length === 0 ){
                res.status(404).send({
                    "Error": "No load with this load_id exists"
                });
            } else {
                // valid volume
                let carrier = load[0][0].carrier
                if (req.body.volume) {
                    patch_load(req.params.load_id, req.body.volume, load[0][0].content, load[0][0].year, carrier)
                    .then( entity => {
                        res.set('Content-Type', 'application/json');
                        res.set("Location", req.protocol + "://" + req.get('host') + req.originalUrl);
                        res.status(200).json({
                        "id": entity.key.id,
                        "volume": entity.data.volume,
                        "content": entity.data.content,
                        "year": entity.data.year,
                        "carrier": carrier,
                        "self": fullUrl  
                    });
                });
                } else {
                    // valid content
                    let carrier = load[0][0].carrier
                    if (req.body.content) {
                        patch_load(req.params.load_id, load[0][0].volume, req.body.content, load[0][0].year, carrier)
                        .then( entity => {
                            res.set('Content-Type', 'application/json');
                            res.set("Location", req.protocol + "://" + req.get('host') + req.originalUrl);
                            res.status(200).json({
                            "id": entity.key.id,
                            "volume": entity.data.volume,
                            "content": entity.data.content,
                            "year": entity.data.year,
                            "carrier": carrier,
                            "self": fullUrl     
                            })
                        })
                    } else {
                        // valid year
                        let carrier = load[0][0].carrier
                        if ( req.body.year) {
                            patch_load(req.params.load_id, load[0][0].volume, load[0][0].content, req.body.year, carrier)
                            .then( entity => {
                                res.set('Content-Type', 'application/json');
                                res.set("Location", req.protocol + "://" + req.get('host') + req.originalUrl);
                                res.status(200).json({
                                "id": entity.key.id,
                                "volume": entity.data.volume,
                                "content": entity.data.content,
                                "year": entity.data.year,
                                "carrier": carrier,
                                "self": fullUrl       
                                })
                            })
                        } else {
                            res.status(400).send({
                                "Error": "The request object is missing at least one of the required attributes"
                            });
                        };
                    } 
                } 
            };
        });
    }   
});


// DELETE load
router.delete('/loads/:load_id', function(req, res){
    const loadQuery = datastore.createQuery(LOAD).filter('__key__', '=', datastore.key([LOAD, parseInt(req.params.load_id,10)]));
    const runLoadQuery = datastore.runQuery(loadQuery);
    return runLoadQuery.then( (load) => {
        if (load[0].length === 0) {
            res.status(404).send({
                "Error": "No load with this load_id exists"
            });
        } else {
            delete_load(req.params.load_id).then(res.status(204).end())
        };
    });
});








/* --------- ASSIGN LOAD TO BOAT ---------- */
// PUT load into boat
router.put('/boats/:boat_id/loads/:load_id', function(req, res) {
    const checkBoatKey = datastore.key([BOAT, parseInt(req.params.boat_id,10)]);
    const checkLoadKey = datastore.key([LOAD, parseInt(req.params.load_id,10)]);
    const boatQuery = datastore.createQuery(BOAT).filter('__key__', '=', datastore.key([BOAT, parseInt(req.params.boat_id,10)]));
    const loadQuery = datastore.createQuery(LOAD).filter('__key__', '=', datastore.key([LOAD, parseInt(req.params.load_id,10)]));
    const runBoatQuery = datastore.runQuery(boatQuery);
    const runLoadQuery = datastore.runQuery(loadQuery);
    // check valid boat
    return runBoatQuery.then( (boat) => {
        if ( boat[0].length === 0 ){
            res.status(404).send({
                "Error": "The specified boat and/or load does not exist"
            });
        } else {
            // check valid load
            return runLoadQuery.then( (load) => {
                if ( load[0].length === 0 ){
                    res.status(404).send({
                        "Error": "The specified boat and/or load does not exist"
                    });
                } else {
                    // check if load is already assigned
                    return datastore.get(checkLoadKey)
                    .then( (checkLoad) => {
                        if (typeof(checkLoad[0].carrier) !== 'undefined') {
                            if (checkLoad[0].carrier === null) {
                             // if not undefined or null, assign load to boat
                             put_load(req.params.boat_id, req.params.load_id)
                             .then(res.status(200).end());                               
                            } else {
                                res.status(403).send({
                                    "Error": "The load is already on a carrier"
                                });
                            }
                        }  else {
                            // if not full, assign load to boat
                            put_load(req.params.boat_id, req.params.load_id)
                            .then(res.status(200).end());
                        }
                    });
                };
            });
        };
    });
});


/* ----------- REMOVE LOAD FROM A BOAT ----------- */
// DELETE load from a boat
router.delete('/boats/:boat_id/loads/:load_id', function(req, res) {
    const checkBoatKey = datastore.key([BOAT, parseInt(req.params.boat_id,10)]);
    const checkLoadKey = datastore.key([LOAD, parseInt(req.params.load_id,10)]);
    const boatQuery = datastore.createQuery(BOAT).filter('__key__', '=', datastore.key([BOAT, parseInt(req.params.boat_id,10)]));
    const loadQuery = datastore.createQuery(LOAD).filter('__key__', '=', datastore.key([LOAD, parseInt(req.params.load_id,10)]));
    const runBoatQuery = datastore.runQuery(boatQuery);
    const runLoadQuery = datastore.runQuery(loadQuery);
    // check valid boat
    return runBoatQuery.then( (boat) => {
        if ( boat[0].length === 0 || null){
            res.status(404).send({
                "Error": "The specified boat and/or load does not exist"
            });
        } else {
            // check valid load
            return runLoadQuery.then( (load) => {
                if ( load[0].length === 0 || null ){
                    res.status(404).send({
                        "Error": "The specified boat and/or load does not exist"
                    });
                } else {
                    // check if load is on boat
                    return datastore.get(checkLoadKey)
                    .then(checkLoad => {
                        if ( checkLoad[0].carrier === null || checkLoad[0].carrier != req.params.boat_id ) {
                            res.status(403).send({
                                "Error": "The specified load is not on this boat"
                            })
                        } else {
                            // delete load from boat
                            delete_loadFromBoat(req.params.boat_id, req.params.load_id)
                            .then(res.status(204).end());                            
                        }
                    });
                }
            });
        }
    });
});


// GET all users
router.get('/users', function(req,res){
    const users = get_users(req)
    .then( (users) => {
        res.status(200).json(users);
    });
});


// LOGIN using Postman
login.post('/', function(req, res){
    const username = req.body.username;
    const password = req.body.password;
    var options = { method: 'POST',
    url: 'https://ballesta-project.us.auth0.com/oauth/token',
    headers: { 'content-type': 'application/json' },
    body:
     { grant_type: 'password',
       username: username,
       password: password,
       client_id: 'V9TZyZtgTLTqvLghoiXpY612paz4KWDp',
       client_secret: 'LjS3ubgZKE0lkbu4gG38KevU8C7k2bPFtxP1Uo4ZYRsHT1sgV06Up4dPWudZjuO5' },
    json: true };
    request(options, (error, response, body) => {
        console.log(options)
        if (error){
            res.status(500).send(error);
        } else {
            res.send(body);
        }
    });
});




/* ------------ End Controller Functions ----------- */

app.use('/', router);
app.use('/login', login);

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
});