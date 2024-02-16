"use strict";

// class
class Pair{
    constructor(fst, snd) {
        this.fst = fst;
        this.snd = snd;
    }
    fmap(f) {
        return new Pair(this.fst, f(this.snd));
    }
    bind(f) {
        return f(this.snd);
    }
}

class AnimLoop{
    constructor(dynamic = false, name = "", frameNum = 0, frameTable = [], prob = new BinDist()) {
        // this.name = name;
        this.dynamic = dynamic;
        this.frameNum = frameNum;
        this.frameTable = frameTable;
        this.dynamicSequence = [];
        this.frames = [];
        this.lastImg = -1;
        this.lastFrameNum = -1;
        this.canvas = undefined;
        this.loadImage = async function() {
            // load images
            for(let i = 0; i < this.frameNum; i++) {
                let img;
                let n = this.physics.state.name;

                await new Promise(resolve => {
                    img = new Image();
                    img.onload = resolve;
                    img.src = 'loop/' + n + '/' + n + '_' + i.toString() + '.png';
                });
                
                // await createImageBitmap(img).then(imgBitmap => this.frames.push(imgBitmap));
                const offScreen = document.createElement('canvas');
                offScreen.width = this.canvas.width;
                offScreen.height = this.canvas.height;
                offScreen.getContext('2d').drawImage(img, 0, 0);
                this.frames.push(offScreen);
            }
        };

        if (dynamic) {
            this.getFrame = function(n, d) {
                let next;
                this.physics.state.iterate();
                for(let i = 0; i < d; i++) {
                    next = this.dynamicSequence.shift();
                    // console.log(this.dynamicSequence.length);
                    while (next === undefined) {
                        this.iterate();
                        // console.log(this.dynamicSequence);
                        next = this.dynamicSequence.shift();
                    }
                }
                // if (this.name == '1_kuchi') console.log(next, this.frames[next]);
                const thisImg = this.translateMap(next);
                if (thisImg === this.lastImg) return;
                const ctx = this.canvas.getContext('2d');

                ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.lastFrameNum = next;
                this.lastImg = thisImg
                if (next === -1) return;
                let img = this.frames[thisImg];
                if (img) ctx.drawImage(img, 0, 0);
                else return;
            }
        } else {
            this.getFrame = function(n, d) {
                const next = n % this.frameTable.length;
                const thisImg = this.frameTable[next];
                if (thisImg === this.lastImg) return;

                let ctx;
                if (this.physics.state.name === 'base') ctx = this.canvas.getContext("2d", { alpha: false });
                else ctx = this.canvas.getContext('2d');

                ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.lastFrameNum = next;
                this.lastImg = thisImg;
                let img = this.frames[thisImg];
                if (img) ctx.drawImage(img, 0, 0);
                else return;
            };
        }

        // iterate physics step and populate dynamicSequence
        // runs every real frame
        this.iterate = function() {
            // console.log(this);
            let probArray = normalize(this.physics.markovMatrices[this.physics.getMarkovIndex()][this.physics.state.action]);
            let maximum = new Pair(-1, 0);
            let rand = Math.random();
            let i;
            // if (this.name == '1_me') console.log(probArray, rand);
            for (i = 0; i < probArray.length; i++) {
                let prob = probArray[i];
                if (prob > maximum.snd) maximum.fst = i;
                if (prob != 0 && rand < prob) break;
                else rand -= prob;
            }
            
            i = i < probArray.length ? i : maximum.fst;
            // if (this.name == '1_me') console.log(i);
            
            this.dynamicSequence.push.apply(this.dynamicSequence, (this.frameTable[this.physics.state.action][i]).bind(this)());
            this.physics.state.setAction(i, this.dynamicSequence.length);
        };

        // THE FOLLOWING NEEDS TO BE DEFINED MANUALLY
        // respond to target name and state
        this.notificationReceptor = undefined;

        this.translateMap = function(a) {return a;};

        this.physics = {
            // it is expected that state contains everything you need to export to another object
            state: {
                name: name, 
                isActive: false, 
                isFrozen: false, 
                isResponse: false, 
                mood: 0, 
                moodScope: [],
                action: 0, 
                actionHistory: Array(10).fill(0),
                numActionKept: 10, 
                setAction: function(n, frames) {
                    this.actionHistory.push(this.action);
                    if (this.actionHistory.length > this.numActionKept)
                        this.actionHistory.shift();
                    this.action = n;
                    this.notify(frames);
                },

                stateRecord: [], 

                updateStateRecord: function(state) {
                    let index = this.stateRecord.map(v => v.name).indexOf(state.name);
                    if (index === -1) {
                        this.stateRecord.push(Object.assign({}, state));
                        return;
                    } else {
                        this.stateRecord.splice(index, 1);
                        this.stateRecord.push(Object.assign({}, state));
                        return;
                    }
                }, 

                getStateRecord: function(state) {
                    let index = this.stateRecord.map(v => v.name).indexOf(state.name);
                    if (index === -1) return undefined;
                    else return this.stateRecord[index];
                },

                iterate: function() {}, 

                // array of functions to call to notify self change
                notificationSubject: [], 

                // adds notification subject function to notification list
                addNotificationSubject: function(n, func) {
                    let index = this.notificationSubject.map(v => v.fst).indexOf(n);
                    if (index > -1) {
                        console.log('Attempt to add \"' + n + '\" to ' + this.name 
                            + 'failed: Element already exists at index ' + index);
                        return;
                    } else this.notificationSubject.push(new Pair(n, func));
                }, 

                // removes notification subject function from notification list
                rmNotificationSubject: function(n) {
                    let index = this.notificationSubject.map(v => v.fst).indexOf(n);
                    if (index === -1) {
                        console.log('Attempt to remove \"' + n + '\" from ' + this.name 
                            + 'failed: Element does not exist');
                        return;
                    } else this.notificationSubject.splice(index, 1);
                }, 

                // calls all functions within the notification array, pass self name and state,
                // and number of frames until the state takes effect
                notify: function(frames = 0) {
                    this.notificationSubject.forEach((v, index) => {
                        // console.log(this);
                        v.snd(this, frames);
                    });
                },

                changeMood: function() {
                    if (this.moodScope.length > 1) {
                        // change expression
                        let newMood = this.mood;
                        while (newMood === this.mood)
                            newMood = this.moodScope[Math.floor(Math.random() * this.moodScope.length)];
                        this.mood = newMood;
                        console.log(stateChangeMessage(this, 'mood: ' + this.mood.toString()), ' with scope ', this.moodScope);
                        this.notify();
                    } else if (this.moodScope.length === 1) this.mood = this.moodScope[0];
                    else throw this.name + ' has a null moodScope';
                },

                prob: prob

                
            },

            
            // set of matrices defining markov chain
            markovMatrices: [],

            refreshMarkov: undefined, 

            // function to know which markov matrix to use
            getMarkovIndex: undefined

        };
    }
}

class BinDist {
    constructor(meanTime = 0, isFrameDependent = true, lowerBound = 0, upperBound = Infinity) {
        this.meanTime = meanTime;
        this.isFrameDependent = isFrameDependent;
        this.lb = lowerBound;
        this.ub = upperBound;
        this.n = 0;
    }
    test() {
        let p = getBinProb(this.meanTime, this.isFrameDependent);
        let lb = this.isFrameDependent ? targetFps * this.lb : this.lb;
        let ub = this.isFrameDependent ? targetFps * this.ub : this.ub;
        // console.log(p);
        if (this.n > ub || (this.n >= lb && Math.random() < p)) {
            this.n = 0;
            return true;
        } else {
            this.n++;
            return false;
        }
    }
    reset() {this.n = 0;}
}

// define constants
const videoWidth = 1920;
const videoHeight = 1080;
const videoFps = 30;

// configure animation frame data
const base = new AnimLoop(false, 'base', 7, 
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 
    1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 
    3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 
    6, 6, 6, 6, 1, 1, 1, 1]
);

const neko = new AnimLoop(false, 'neko', 3, 
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 
    0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 
    2, 2, 2, 2, 1, 1, 1, 1, 0, 0, 
    0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 
    1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 
    1, 1, 2, 2, 2, 2, 1, 1, 1, 1]
);

const atama1 = new AnimLoop(false, '1_atama', 15, 
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 
    0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 
    5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 
    10, 10, 11, 11, 12, 12, 13, 13, 
    14, 14]
);

const screenScroll = new AnimLoop(false, 'scroll', 5, 
    [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 
    3, 3, 4, 4, 4, 4, 0, 0, 0, 0], 
    new BinDist(2)
);

screenScroll.offset = 0;

screenScroll.getFrame = function(n, d) {
    if (this.lastFrameNum > (n - this.offset) % this.frameTable.length && !this.physics.state.prob.test()) {
        this.offset = (this.offset + d) % this.frameTable.length;
        // console.log('paused');
    }
    const next = (((n - this.offset) % this.frameTable.length) + this.frameTable.length) % this.frameTable.length;
    const thisImg = this.frameTable[next];
    if (thisImg === this.lastImg) return;
    const ctx = this.canvas.getContext('2d');

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.lastFrameNum = next;
    this.lastImg = thisImg;
    let img = this.frames[thisImg];
    if (img) ctx.drawImage(img, (1920 - videoWidth) / 2, 0);
    else return;    
}

const bldg = new AnimLoop(false, 'bldg', 7, 
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 
    1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 
    2, 2, 2, 2, 1, 1, 1, 1, 0, 0, 
    4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 
    6, 6, 5, 5, 5, 5, 4, 4, 4, 4]
);

// frameTable for dynamic animations have 3 layers
// the first index corresponds to initial state
// the second index corresponds to the end state
// the value is a function that returns an array of frames

const kuchiTable = [[
        function() {return [0, 0];}, 
        function() {return [];}, 
        function() {return [];}
    ],
    [
        function() {return [];}, 
        function() {return [1, 1];}, 
        function() {return [];}
    ],
    [
        function() {return [];}, 
        function() {return [];}, 
        function() {return [2, 2];}
    ]];

const kuchiMarkov = function() {
    this.markovMatrices = [
        // when not active
        [
            [1, 0, 0], 
            [1, 0, 0], 
            [1, 0, 0]
        ], 
        // when active
        [
            [0.5, 0.3, 0.2], 
            [0.1, 0.3, 0.6], 
            [0.05, 0.25, 0.7]
        ]
    ];
};



const me0 = new AnimLoop(true, '0_me', 17, 
    [[   
        // 0 - 0
        function() {return Array(118).fill(3);},

        // 0 - 1
        function() {return [2, 2, 2, 0, 0, 0];}        
    ], 
    [
        // 1 - 0
        function() {
            if (Math.random() < 0.5) return [1, 1, 1, 2, 2, 2, 3, 3, 3, 2, 2, 2, 0, 0, 0, 1, 1, 1, 2, 2, 2];
            else return [1, 1, 1, 2, 2, 2];
        },
        // 1 - 1
        function() {return Array(118).fill(0);}
    ]
], new BinDist(3, 3, 10));

me0.physics.state.prob2 = new BinDist (10, 5, 30)

// mood for admin's eyes
// 0 - positive
// 1 - very positive
// 2 - neutral looking left
// 3 - neutral looking right
// 4 - closed positive
// 5 - closed neutral
// 6 - surprised
// 7 - crying (almost)
// 8 - anger

me0.translateMap = function(x) {
    let mood = this.physics.state.mood;
    if (mood > 5) return mood + 8;
    else {
        switch(mood) {
        case 0:
            return x;
            
        case 1:
            return x === 0 ? 0 : x + 3;

        case 2:
            return x + 7;

        case 3:
            return x === 0 ? 7 : x + 10;

        case 4:
            return 0;
        
        case 5:
            return 7;
    }
    }

}

me0.physics.refreshMarkov = function() {
    this.markovMatrices = [
        [
            // 0
            [0, 1],
            [1, 0]
        ], 
        [
            // 1
            [1, 0],
            [1, 0]
        ]
    ];
}

me0.physics.getMarkovIndex = function() {
    return this.state.actionHistory.at(-1);
}

me0.notificationReceptor = function(state, n) {
    this.physics.state.updateStateRecord(state);

    switch(state.name) {
        case '0_kuchi':
            if (state.isActive && !this.physics.state.isActive) {
                this.physics.state.isActive = state.isActive;
                this.physics.state.prob.reset();
                console.log(stateChangeMessage(this.physics.state, 'active', state, 'active'));
                if (this.physics.state.isFrozen) {
                    this.physics.state.moodScope = [2, 4, 7, 8];
                    this.physics.state.changeMood();
                } else {
                    this.physics.state.moodScope = [0, 1, 2, 3, 4, 5, 7];
                    this.physics.state.changeMood();
                }
                this.physics.state.notify();
            } else if (!state.isActive && this.physics.state.isActive) {
                this.physics.state.isActive = state.isActive;
                this.physics.state.prob.reset();
                console.log(stateChangeMessage(this.physics.state, 'inactive', state, 'inactive'));
                // pass the ball
                if ((this.physics.state.mood < 2 || this.physics.state.mood === 4) && state.mood === 1) {
                    // freeze
                    this.physics.state.isFrozen = true;
                    this.physics.state.mood = 4;
                    this.physics.state.moodScope = [6];
                    console.log(stateChangeMessage(this.physics.state, 'frozen'));
                    if (this.physics.state.action != 1) {
                        this.dynamicSequence = this.frameTable[0][1].bind(this)();
                    }
                } else {
                    this.physics.state.isFrozen = false;
                    this.physics.state.mood = 2;
                    this.physics.state.moodScope = [2];
                }
                
                this.physics.state.notify();
            } else {}
            break;
    }
}

me0.physics.state.iterate = function() {
    if (this.isFrozen && this.mood === 4 && !this.isActive) {
        if (this.prob.test()) {
            this.mood = 6;
            this.notify();
        } else {}
    } else if (this.isFrozen && this.isActive) {
        if (this.prob2.test()) {
            this.isFrozen = false;
            this.moodScope = [0, 1, 2, 3, 4, 5, 7];
            this.changeMood();
            console.log(stateChangeMessage(this, 'unfrozen'));
            this.notify();
        }
    } else if (!this.isFrozen && !this.isActive) {
        if (this.prob.test()) {
            this.mood = 7;
            this.notify();
        } else {}
    } else {
        if (this.prob.test()) this.changeMood();
    }
}

me0.physics.state.moodScope = [0, 1, 2, 3, 4, 5, 7];
me0.physics.state.mood = 2;


const kuchi0 = new AnimLoop(true, '0_kuchi', 12, kuchiTable, new BinDist(5, true, 5, 20));
kuchi0.physics.state.prob2 = new BinDist(20, true, 5, 60);

kuchi0.translateMap = function(x) {return x + this.physics.state.mood * 3;}

kuchi0.physics.refreshMarkov = kuchiMarkov;

kuchi0.physics.getMarkovIndex = function() {
    if (this.state.isActive) return 1;
    else return 0;
}

kuchi0.physics.state.iterate = function() {
    // passing the ball
    if (this.isActive) {
        // admin is active
        if (this.prob2.test()) {
            // pass to mimoza
            console.log('ball passed to mimosa');
            this.isActive = false;
            this.notify(0);
        } else {}
    } else {}
    if (this.prob.test()) this.changeMood();
};

kuchi0.notificationReceptor = function(state, n) {

    switch(state.name) {
        case '1_kuchi':
            if (!state.isActive && !this.physics.state.isActive) {
                console.log('ball caught by admin');
                this.physics.state.isActive = true;
                this.physics.state.notify(0);
            } 
            break;

        case '0_me':
            // change freeze state
            if (state.isFrozen && !this.physics.state.isFrozen) {
                this.physics.state.isFrozen = true;
                console.log(stateChangeMessage(this.physics.state, 'frozen', state, 'frozen'));
                this.physics.state.mood = 1;
                this.physics.state.notify();
            } else if (!state.isFrozen && this.physics.state.isFrozen) {
                this.physics.state.isFrozen = false;
                console.log(stateChangeMessage(this.physics.state, 'unfrozen', state, 'unfrozen'));
                this.physics.state.notify();
            } else {}

            let oldState = this.physics.state.getStateRecord(state);
            // console.log(oldState);
            if (!oldState || state.mood != oldState.mood || state.isActive != oldState.isActive || state.isFrozen != oldState.isFrozen) {
                console.log('state change detected');
                this.physics.state.prob.reset();
                // console.log(this.physics.state.isActive.toString(), this.physics.state.isFrozen.toString());
                if (this.physics.state.isActive) {
                    if (this.physics.state.isFrozen) {
                        
                        switch(state.mood) {
                            case 0:
                            case 1:
                            case 3:
                            case 5:
                            case 6:
                                throw 'mood ' +state.mood.toString() + ' not permitted during normal conversation';
                                break;

                            case 2:
                                this.physics.state.moodScope = [0, 2];
                                break;

                            case 4:
                                this.physics.state.moodScope = [1, 2];
                                break;

                            case 7:
                                this.physics.state.moodScope = [2];
                                break;

                            case 8: 
                                this.physics.state.moodScope = [3];
                                break;
                        }
                    } else {
                        switch(state.mood) {
                            case 0:
                            case 4:
                                this.physics.state.moodScope = [0, 1];
                                break;

                            case 1:
                                this.physics.state.moodScope = [1];
                                break;

                            case 2:
                            case 3:
                            case 5:
                                this.physics.state.moodScope = [0, 2];
                                break;
                            
                            case 6:
                                throw 'mood 6 not permitted during normal conversation';
                                break;

                            case 7:
                                this.physics.state.moodScope = [2];
                                break;

                            case 8: 
                                throw 'mood 8 not permitted during normal conversation';
                                break;
                        }
                    }
                } else {
                    if (this.physics.state.isFrozen) {
                        this.physics.state.moodScope = [1];
                    } else {
                        this.physics.state.moodScope = [0, 2];
                    }
                }
                this.physics.state.changeMood();
            }
            break;
            
    }
    this.physics.state.updateStateRecord(state);
};

kuchi0.translateMap = function(n) {
    if (this.physics.state.isFrozen && !this.physics.state.isActive) {
        return 3 * this.physics.state.mood + 2;
    } else if (!this.physics.state.isFrozen && !this.physics.state.isActive) {
        switch (this.physics.state.mood) {
            case 0:
                return 0;

            case 2:
                return 7;

            default:
                throw 'unexpected mood';
        }
    } else return n + 3 * this.physics.state.mood;
}

kuchi0.physics.state.mood = 0;
kuchi0.physics.state.moodScope = [0, 2];


const accentItr = function() {
    this.dynamicSequence.push.apply(this.dynamicSequence, this.frameTable[this.physics.state.mood]);
    this.physics.state.setAction(this.physics.state.mood, this.dynamicSequence.length);
}


const accentMen = new AnimLoop(true, 'accent_men', 2, 
[[-1], [0], [1]], new BinDist(3, true, 3, 10));


accentMen.iterate = accentItr;

accentMen.physics.refreshMarkov = () => {}

accentMen.notificationReceptor = function(state, n) {
    switch(state.name) {
        case '0_kuchi':
            if (state.isActive && !this.physics.state.isActive) {
                this.physics.state.isActive = true;
                console.log(stateChangeMessage(this.physics.state, 'active', state, 'active'));
                this.physics.state.notify();
            } else if (!state.isActive && this.physics.state.isActive) {
                this.physics.state.isActive = false;
                console.log(stateChangeMessage(this.physics.state, 'inactive', state, 'inactive'));

                this.physics.state.notify();
            }
            break;

        case '0_me':
            if (state.isFrozen && !this.physics.state.isFrozen) {
                this.physics.state.isFrozen = true;
                console.log(stateChangeMessage(this.physics.state, 'frozen', state, 'frozen'));
                this.physics.state.notify();
            } else if (!state.isFrozen && this.physics.state.isFrozen) {
                this.physics.state.isFrozen = false;
                console.log(stateChangeMessage(this.physics.state, 'unfrozen', state, 'unfrozen'));
                this.physics.state.notify();
            }

            let oldState = this.physics.state.getStateRecord(state);

            if (!oldState || state.mood != oldState.mood) {
                console.log('state change detected by accentMen', state.mood);
                this.physics.state.prob.reset();
                if (this.physics.state.isActive || state.isActive) {
                    if (state.mood > 1 && state.mood < 8) {
                        if(Math.random() < 0.5) {
                            if (Math.random() < 0.5) this.physics.state.mood = 1;
                            else this.physics.state.mood = 2;
                        } 
                    } else {this.physics.state.mood = 0;}
                }
                this.physics.state.notify();
            }
            break;
    }
    this.physics.state.updateStateRecord(state);
};

accentMen.physics.state.iterate = function() {
    if(!this.isActive && this.mood < 2 && this.prob.test()) this.mood++;
};



const accent = new AnimLoop(true, 'accent', 13, 
[
    [-1], 
    [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 
    2, 2, 3, 3, 3, 3, 4, 4, 4, 4], 
    [5, 5, 5, 5, 6, 6, 6, 6, 7, 7, 
    7, 7, 8, 8, 8, 8, 6, 6, 6, 6, 
    5, 5, 5, 5, 9, 9, 9, 9, 10, 10, 
    11, 11, 11, 11, 12, 12, 12, 12,
    10, 10, 10, 10, 9, 9, 9, 9]
], new BinDist(3, true, 3, 10));


accent.iterate = accentItr;

accent.physics.refreshMarkov = () => {}

accent.physics.state.iterate = function() {
    if (this.moodScope.indexOf(this.mood) === -1) {
        this.mood = this.moodScope[0];
    } else if (this.mood != this.moodScope.at(-1)) {
        if (this.prob.test()) this.mood = this.moodScope.at(-1);
    }
}
accent.physics.state.moodScope = [0];


accent.notificationReceptor = function(state, n) {
    // console.log('accent called');
    switch(state.name) {
        case '0_kuchi':
            if (state.isActive && !this.physics.state.isActive) {
                this.physics.state.isActive = true;
                console.log(stateChangeMessage(this.physics.state, 'active', state, 'active'));
            } else if (!state.isActive && this.physics.state.isActive) {
                this.physics.state.isActive = false;
                console.log(stateChangeMessage(this.physics.state, 'inactive', state, 'inactive'));

                this.physics.state.notify();
            }
            break;

        case '0_me':
            if (state.isFrozen && !this.physics.state.isFrozen) {
                this.physics.state.isFrozen = true;
                console.log(stateChangeMessage(this.physics.state, 'frozen', state, 'frozen'));
            } else if (!state.isFrozen && this.physics.state.isFrozen) {
                this.physics.state.isFrozen = false;
                console.log(stateChangeMessage(this.physics.state, 'unfrozen', state, 'unfrozen'));
            }

            let oldState = this.physics.state.getStateRecord(state);

            if (!oldState || state.mood != oldState.mood) {
                console.log('state change detected by accent', state.mood);
                this.physics.state.prob.reset();
                switch(state.mood) {
                    case 6:
                    case 8:
                        this.physics.state.mood = 1;
                        this.physics.state.moodScope = [1];
                        break;

                    case 2:
                    case 3:
                    case 5:
                        this.physics.state.moodScope = [0, 1];
                        break;

                    case 1:
                        this.physics.state.mood = 2;
                        this.physics.state.moodScope = [2];
                        break;

                    default:
                        this.physics.mood = 0;
                        this.physics.state.moodScope = [0];
                        break;
                }
            }
            break;
    }
    this.physics.state.updateStateRecord(state);
};





const te0 = new AnimLoop(true, '0_te', 5,
        [
            [-1],
            [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 
            1, 1, 2, 2, 2, 2, 3, 3, 3, 3,
            4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 
            4, 4, 3, 3, 3, 3, 2, 2, 2, 2, 
            1, 1, 1, 1]
        ]
);

te0.iterate = function() {
    if (this.physics.state.isFrozen && !this.physics.state.isActive)
        this.dynamicSequence.push(this.lastFrameNum);
    else accentItr.bind(this)();
}

te0.physics.refreshMarkov = () => {}

te0.notificationReceptor = function(state, n) {
    switch(state.name) {
        case '0_kuchi':
            if (state.isActive && !this.physics.state.isActive) {
                this.physics.state.isActive = true;
                console.log(stateChangeMessage(this.physics.state, 'active', state, 'active'));
            } else if (!state.isActive && this.physics.state.isActive) {
                this.physics.state.isActive = false;
                console.log(stateChangeMessage(this.physics.state, 'inactive', state, 'inactive'));
                this.physics.state.mood = 0;
                this.dynamicSequence = [];
                this.physics.state.notify();
            }
            break;

        case '0_me':
            if (state.isFrozen && !this.physics.state.isFrozen) {
                this.physics.state.isFrozen = true;
                console.log(stateChangeMessage(this.physics.state, 'frozen', state, 'frozen'));
            } else if (!state.isFrozen && this.physics.state.isFrozen) {
                this.physics.state.isFrozen = false;
                console.log(stateChangeMessage(this.physics.state, 'unfrozen', state, 'unfrozen'));
            }

            let oldState = this.physics.state.getStateRecord(state);

            if ((!oldState || state.mood != oldState.mood) && state.isActive) {
                console.log('state change detected by 0_te: ', state.mood);
                this.physics.state.prob.reset();
                switch(state.mood) {
                    case 1:
                    case 8:
                        if (this.physics.state.mood != 1) {
                            this.physics.state.mood = 1;
                            this.dynamicSequence = [];
                        }
                        
                        break;

                    case 2:
                    case 5:
                    case 6:
                        if (this.physics.state.mood != 0) {
                            this.physics.state.mood = 0;
                            this.dynamicSequence = [];
                        }
                        break;

                    default:
                        if (Math.random() < 0.2) {
                            if (this.physics.state.mood != 1) {
                                this.physics.state.mood = 1;
                                this.dynamicSequence = [];
                            }
                        }
                        else if (this.physics.state.mood != 0) {
                            this.physics.state.mood = 0;
                            this.dynamicSequence = [];
                        }
                        break;
                }
            }
            break;
    }
    this.physics.state.updateStateRecord(state);
    
}



const me1 = new AnimLoop(true, '1_me', 7, 
        [[   
            // on admin
            // 0 - 0
            function() {return Array(118).fill(3);},

            // 0 - 1
            function() {
                let n = this.frameTable[0][0].bind(this)().length;
                let eventFrame = Math.floor(Math.random() * n / 2 + n / 4);
                let output = [];
                output.push.apply(output, (this.frameTable[0][0].bind(this))().slice(0, eventFrame));
                output.push.apply(output, [2, 2]);
                n -= eventFrame + 2;
                output.push.apply(output, (this.frameTable[1][1].bind(this))().slice(0, n));
                return output;
            },
            // 0 - 2
            function() {return [2, 2, 2, 0, 0, 0];}        
        ], 
        [   
            // on hands
            // 1 - 0
            function() {
                let n = this.frameTable[1][1]().length;
                let eventFrame = Math.floor(Math.random() * n / 2 + n / 4);
                let output = [];
                output.push.apply(output, (this.frameTable[1][1].bind(this))().slice(0, eventFrame));
                output.push.apply(output, [2, 2]);
                n -= eventFrame + 2;
                output.push.apply(output, (this.frameTable[0][0].bind(this))().slice(0, n));
                return output;
            },
            // 1 - 1
            function() {
                let output = [];
                if (Math.random < 0.5) {
                    // double blink
                    output.push.apply(output, (this.frameTable[1][2].bind(this))());
                    output.push.apply(output, (this.frameTable[2][1].bind(this))());
                } else {}
                output.push.apply(output, Array(118).fill(6));
                return output;
            }, 
            // 1 - 2
            function() {return [5, 5, 5, 0, 0, 0];}
        ], 
        [   
            // closed
            // 2 - 0
            function() {
                if (Math.random() < 0.1) return [1, 1, 1, 2, 2, 2, 3, 3, 3, 2, 2, 2, 0, 0, 0, 1, 1, 1, 2, 2, 2];
                else return [1, 1, 1, 2, 2, 2];
            },
            // 2 - 1
            function() {if (Math.random() < 0.1) return [4, 4, 4, 5, 5, 5, 6, 6, 6, 5, 5, 5, 0, 0, 0, 4, 4, 4, 5, 5, 5];
                else return [4, 4, 4, 5, 5, 5];
            },
            // 2 - 2
            function() {return Array(118).fill(0);}
        ]], 
        new BinDist(10, false)
);

me1.physics.refreshMarkov = function() {
    this.markovMatrices = [
        // inactive
        [
            // history: 0
            [0, 0, 1], 
            [0, 0, 1], 
            [1, 0, 0]
        ], 
        [
            // history: 1
            [0, 0, 1], 
            [0, 0, 1], 
            [1, 0, 0]
        ],
        [
            // history: 2
            [1, 0, 0], 
            [1, 0, 0], 
            [1, 0, 0]
        ],
        // active
        [
            // 0
            [0, 0, 1], 
            [0, 0, 1],
            [1 - 2 * getBinProb(10, false), getBinProb(10, false), getBinProb(10, false)]
        ], 
        [
            // 1
            [0, 0, 1], 
            [0, 0, 1], 
            [getBinProb(10, false), 1 - 2 * getBinProb(10, false), getBinProb(10, false)]
        ], 
        [
            // 2
            [1 - getBinProb(10, false), getBinProb(10, false), 0], 
            [getBinProb(10, false), 1 - getBinProb(10, false), 0], 
            [getBinProb(10, false), getBinProb(10, false), 1 - 2 * getBinProb(10, false)]
        ]
    ];
}

me1.physics.getMarkovIndex = function() {
    // console.log(me1.physics);
    return this.state.isActive ? this.state.actionHistory.at(-1) + 3 : this.state.actionHistory.at(-1);
}

me1.notificationReceptor = function(state, nFrames) {
    switch(state.name) {
        case '1_kuchi':
            if (state.isActive != this.physics.state.isActive) {
                this.physics.state.isActive = state.isActive;
                this.physics.state.notify();
            }
            break;
    }
};


const kuchi1 = new AnimLoop(true, '1_kuchi', 3, kuchiTable, new BinDist(15, true, 3, 30));

kuchi1.physics.refreshMarkov = kuchiMarkov;

kuchi1.physics.getMarkovIndex = function() {
    if (this.state.isActive) return 1;
    else return 0;
}

kuchi1.physics.state.iterate = function() {
    // passing the ball
    if (this.isActive) {
        // mimosa is active
        if (this.prob.test()) {
            // pass to admin
            console.log('ball passed to admin');
            this.isActive = false;
            this.notify(0);
        } else {}
    } else {}
}

kuchi1.notificationReceptor = function(state, n) {
    switch(state.name) {
        case '0_kuchi':
            if (!state.isActive && !this.physics.state.isActive) {
                console.log('ball caught by mimosa');
                this.physics.state.isActive = true;
                this.physics.state.notify(0);
            }
    }
};

const persistent = [base, bldg, atama1, neko, screenScroll, kuchi1, kuchi0, me1, me0, te0, accentMen, accent];

// fetch DOM elements
const stage = document.getElementById('assemble');

// define global variables
var lastFrameTime;
var frameNum = 0;
var targetFps = 30;

// helpers
function getBinProb(mean, isFrameDependent) {
    if (isFrameDependent) return mean === 0 ? 1.0 : 1.0 / targetFps / mean;
    else return mean === 0 ? 1.0 : 1.0 / mean;
}

function normalize(arr, func = a => {
    let sum = 0;
    a.forEach(v => {sum += v;});
    return sum;
}) {
    let den = func(arr);
    if (den === 0) throw 'normalize: array consists of all 0';
    else return arr.map(v => v / den);
}


function stateChangeMessage(object, effect, state, cause) {
    if (state && cause)
        return object.name + ' changed to ' + effect + ' since ' + state.name + ' changed to ' + cause;
    else return object.name + ' changed to ' + effect;
}

function assembleFrame(frameNum, diffFrameNum) {
    persistent.forEach(function(v, index) {
        v.getFrame(frameNum, diffFrameNum);
    });
}

function step() {
    const currentTime = Date.now();
    const diff = currentTime - lastFrameTime;
    const diffFrameNum = Math.floor(diff / (1000 / videoFps));
    if (diff > 1000 / targetFps && diffFrameNum > 0) {
        frameNum = (frameNum + diffFrameNum) % 8400;
        lastFrameTime = currentTime;
        assembleFrame(frameNum, diffFrameNum); 
    }
    requestAnimationFrame(step);
}

window.wallpaperPropertyListener = {
    applyGeneralProperties: function(p) {
        console.log('General Property Change: ', p);
        if (p.fps) {
            targetFps = p.fps;
            persistent.forEach(function(v) {
                v.refreshMarkov();
            });
        }
    }
}



async function init() {
    for (const v of persistent) {
        const canvas = document.getElementById(v.physics.state.name);
        // console.log(canvas);
        canvas.setAttribute('height', videoHeight);
        canvas.setAttribute('width', videoWidth);

        v.canvas = canvas;
        await v.loadImage();
    }

    // add self notification receptor to add notification queue of all
    // dynamic frame generators
    persistent.forEach(function(v, i) {
        if (v.dynamic) {
            persistent.forEach((value, index) => {
                if(value.dynamic && value.physics.state.name != v.physics.state.name)
                    v.physics.state.addNotificationSubject(value.physics.state.name, value.notificationReceptor.bind(value));
                else return;
            });
            v.physics.refreshMarkov();
            v.physics.state.notify();
        }
    });
        
    kuchi0.physics.state.isActive = true;
    kuchi0.physics.state.notify();
}


async function main() {
    await init();
    setTimeout(function() {
        lastFrameTime = Date.now();
        requestAnimationFrame(step);
    }, 3000);
    let intro = document.getElementById('intro');
    intro.play();
    setTimeout(function() {
        intro.style.opacity = 0;
    }, 4000);
    setTimeout(function() {
        intro.remove();
    }, 5000);
}

main();


