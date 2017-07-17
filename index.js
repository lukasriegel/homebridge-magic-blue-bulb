var Service;
var Characteristic;
var HomebridgeAPI;
var noble = require('noble');
var rgbConversion = require("./rgbConversion");


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
        "on" : true,
        "values" : rgbConversion.rgbToHsl(255, 255, 255)
    };
    this.mac = config.mac.toLowerCase();
    this.handle = config.handle || "fffc";

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
        that.peripheral.writeHandle(that.handle, new Buffer.from([rgb.r, rgb.g, rgb.b],'hex'), true, function (error) {
            if (error) console.log('BLE: Write handle Error: ' + error);
            callback();
        });
    };
    this.attemptConnect(temp);
};

PlaybulbCandle.prototype.attemptConnect = function(callback){
    if (this.peripheral && this.peripheral.state == "connected") {
        callback(true);
    } else if (this.peripheral && this.peripheral.state == "disconnected") {
        this.log("lost connection to bulb. attempting reconnect ...");
        var that = this;
        this.peripheral.connect(function(error) {
            if (!error) {
                that.log("reconnect was successful");
                callback(true);
            } else {
                that.log("reconnect was unsuccessful");
                callback(false);
            }
        });
    }
}

PlaybulbCandle.prototype.setState = function(status, callback) {
    var code = 0x24, that = this;
    if (status) {
        code = 0x23;
    } 
    var temp = function(res) {
        if (!that.peripheral || !res) {
            callback(new Error());
            return;
        }
        that.peripheral.writeHandle(that.handle, new Buffer([0xcc, code, 0x33]), true, function (error) {
            if (error) that.log('BLE: Write handle Error: ' + error);
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
