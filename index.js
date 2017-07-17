var Service;
var Characteristic;
var HomebridgeAPI;
var noble = require('noble');
var rgbConversion = require("./rgbConversion");

var SETCOLOR = -1;
var types = {
    CANDLE: {
        colorUuid: "fffc",
        effectsUuid: "fffb",
        modes: {
            FADE: 0,
            JUMPRGB: 1,
            FADERGB: 2,
            FLICKER: 3
        }
    }
};

function randInt(n) {
    return Math.floor(Math.random() * n);
}

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    HomebridgeAPI = homebridge;

    homebridge.registerAccessory("homebridge-mipow-playbulb-candle", "mipow-playbulb-candle", PlaybulbCandle);
};


function PlaybulbCandle(log, config) {
    var that = this;
    this.log = log;
    this.name = config.name;
    this.ledsStatus = {
        "on" : 1,
        "values" : rgbConversion.rgbToHsl(0, 0, 0)
    };
    this.mac = config.mac.toLowerCase();
    this.handle = "fffc";

    this.findBulb(this.mac);

    // info service
    this.informationService = new Service.AccessoryInformation();
        
    this.informationService
        .setCharacteristic(Characteristic.Manufacturer, config.manufacturer || "MiPow")
        .setCharacteristic(Characteristic.Model, config.model || "Playbulb Candle")
        .setCharacteristic(Characteristic.SerialNumber, config.serial || "5D4989E80E44");

    this.service = new Service.Lightbulb(this.name);

    this.service.getCharacteristic(Characteristic.On)
        .on('get', this.getState.bind(this));
    this.service.getCharacteristic(Characteristic.On)
        .on('set', this.setState.bind(this));

    this.service.getCharacteristic(Characteristic.Hue)
        .on('get', this.getHue.bind(this));
    this.service.getCharacteristic(Characteristic.Hue)
        .on('set', this.setHue.bind(this));

    this.service.getCharacteristic(Characteristic.Saturation)
        .on('get', this.getSat.bind(this));
    this.service.getCharacteristic(Characteristic.Saturation)
        .on('set', this.setSat.bind(this));

    this.service.getCharacteristic(Characteristic.Brightness)
        .on('get', this.getBright.bind(this));
    this.service.getCharacteristic(Characteristic.Brightness)
        .on('set', this.setBright.bind(this));
}

PlaybulbCandle.prototype.findBulb = function(mac, callback) {
    var that = this;
    noble.on('stateChange', function(state) {
        if (state === 'poweredOn') {
            noble.startScanning();
        } else {
            noble.stopScanning();
        }
    });

    noble.on('discover', function(peripheral) {
        if (peripheral.id === mac || peripheral.address === mac) {
            that.log("found bulb: " + mac);
            that.peripheral = peripheral;
        }
    });
};

PlaybulbCandle.prototype.writeColor = function(callback) {
    var that = this;
    var temp = function(res) {
        if (!res) {
            //callback(new Error());
            return;
        }
        var rgb = rgbConversion.hslToRgb(that.ledsStatus.values[0], that.ledsStatus.values[1], that.ledsStatus.values[2]);

        var colorBytes = new Buffer([0, rgb.r, rgb.g, rgb.b],'hex');
        that.peripheral.colorChar.write(colorBytes, true, function (error) {
            if (error) console.log('BLE: Write handle Error: ' + error);
            callback();
        });
    };
    this.attemptConnect(temp);
};

PlaybulbCandle.prototype.attemptConnect = function(callback){
    var that = this;
    if (this.peripheral && this.peripheral.state == "connected") {
        callback(true);
    } else if (this.peripheral && this.peripheral.state == "disconnected") {
        this.log("lost connection to bulb. attempting reconnect ...");
        var that = this;
        this.peripheral.connect(function(error) {
            if (!error) {
                that.log("reconnect was successful");
                that.peripheral.discoverAllServicesAndCharacteristics(); 
                that.log("discoverAllServicesAndCharacteristics");
                that.peripheral.on('servicesDiscover', function (services) {
                    services.map(function (service) {
                        service.on('characteristicsDiscover', function (characteristics) {
                            characteristics.map(function (characteristic) {
                                if (characteristic.uuid === types["CANDLE"].colorUuid) {
                                    that.peripheral.colorChar = characteristic;
                                    that.log("CANDLE colorUuid set" );
                                    callback(true);
                                } else if (characteristic.uuid === types["CANDLE"].effectsUuid) {
                                    that.peripheral.effectsChar = characteristic;
                                    //isReady();
                                }
                            });
                        });
                    });
                });
            } else {
                that.log("reconnect was unsuccessful");
                callback(false);
            }
        });
    }
    else{
        that.findBulb(that.mac);
    }
}

PlaybulbCandle.prototype.setState = function(status, callback) {
    var code = 0x24, that = this;
    if (status) {
        code = 0x23;
    } 
    var temp = function(res) {
        if (!res) {
            //callback(new Error());
            return;
        }
        var rgb = rgbConversion.hslToRgb(that.ledsStatus.values[0], that.ledsStatus.values[1], that.ledsStatus.values[2]);
        that.log("setState" +  that.ledsStatus.on);
        var colorBytes = new Buffer([0, rgb.r, rgb.g, rgb.b],'hex');
        if(that.ledsStatus.on == true){
            that.ledsStatus.on = 0;
            colorBytes = new Buffer([0, 0, 0, 0],'hex');
        }
        else{
            that.ledsStatus.on = 1;
            var r = randInt(256), g = randInt(256), b = randInt(256);
            colorBytes = new Buffer([0, r, g, b],'hex');
        }
        that.peripheral.colorChar.write(colorBytes, true, function (error) {
            if (error) console.log('BLE: Write handle Error: ' + error);
            callback();
        });
    };
    this.attemptConnect(temp);
    this.ledsStatus.on = status;
};

PlaybulbCandle.prototype.getState = function(callback) {
    callback(null, this.ledsStatus.on);
};



PlaybulbCandle.prototype.getHue = function(callback) {
    callback(null, this.ledsStatus.values[0]);
};

PlaybulbCandle.prototype.setHue = function(level, callback) {
    this.ledsStatus.values[0] = level;
    if (this.ledsStatus.on) {
        this.writeColor(function() {
            callback();
        });
    } else {
        callback();
    }
};

PlaybulbCandle.prototype.getSat = function(callback) {
    callback(null, this.ledsStatus.values[1]);
};

PlaybulbCandle.prototype.setSat = function(level, callback) {
    this.ledsStatus.values[1] = level;
    if (this.ledsStatus.on) {
        this.writeColor(function() {
            callback();
        });
    } else {
        callback();
    }
};

PlaybulbCandle.prototype.getBright = function(callback) {
    callback(null, this.ledsStatus.values[2]);
};

PlaybulbCandle.prototype.setBright = function(level, callback) {
    this.ledsStatus.values[2] = level;
    if (this.ledsStatus.on) {
        this.writeColor(function() {
            callback();
        });
    } else {
        callback();
    }
};

PlaybulbCandle.prototype.getServices = function() {
    return [this.informationService, this.service];
};
