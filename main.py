from machine import Pin
import utime
import network
import ntptime
import machine
import requests
import mcron
import _thread
import socket
import gc
import io
import os
import json
# import ssl

blueLED = Pin(45, Pin.OUT)
redLED = Pin(46, Pin.OUT)
redLED.value(0)  # On
selfIp = ""

lastPostTimeSeconds = utime.time()
meters = [{"pin": 8}, {"pin": 9}]
kwhpercount = 1/1000


def connectToInternet():
    global selfIp
    global nic
    nic.active(True)
    utime.sleep(2)
    nic.disconnect()
    utime.sleep(2)
    while not nic.isconnected():
        #print("tryign")
        try:
            nic.connect("Hedelands Veteranbane", "3WY6D5FYH3M8R")
        except Exception as e:
            print(e)
            print("Status: " + str(nic.status()))
            utime.sleep(5)
            continue
    while nic.ifconfig()[0] == "0.0.0.0":
        utime.sleep(5)
    utime.sleep(5)
    selfIp = nic.ifconfig()[0]
    print("Ip: " + selfIp)


def syncTime():
    ntptime.settime()
    # Fix timezone
    t = utime.localtime()
    machine.RTC().datetime((t[0], t[1], t[2], t[6] + 1, t[3] + 1, t[4], t[5], 0))
    print("Time: " + str(utime.localtime()))


def postRecent(callbackId, currentTime, callbackMemory):
    #utime.sleep(0.1)
    global lastPostTimeSeconds
    global meters
    lastPostTime = utime.localtime(lastPostTimeSeconds)
    start = f"{lastPostTime[0]}-{lastPostTime[1]}-{lastPostTime[2]} {lastPostTime[3]}:{lastPostTime[4]}:{lastPostTime[5]}"
    currentTimeSeconds = utime.time()
    currentTime = utime.localtime(currentTimeSeconds)
    end = f"{currentTime[0]}-{currentTime[1]}-{currentTime[2]} {currentTime[3]}:{currentTime[4]}:{currentTime[5]}"
    #durationHours = utime.ticks_diff(lastPostTimeTicks, currentTimeTicks) / 60 / 60
    for meter in meters:
        kwh = kwhpercount * meter["count"]
        meter["count"] = 0
        checkConnection()
        try:
            response = requests.post(
                "https://forbrug.ibk.dk/receiver.php",
                data=f"start={start}&end={end}&kwh={kwh}&meter={meter["pin"]}",
                headers=dict({"Content-Type": "application/x-www-form-urlencoded"})
            )
        except Exception as e:
            print(e)
        #print(str(utime.localtime()) + " Response " + str(response.status_code) + ": " + str(response.content))
    lastPostTimeSeconds = currentTimeSeconds


def blink():
    blueLED.value(0)  # On
    utime.sleep(0.2)
    blueLED.value(1)  # Off


def toHours(ms):
    return ms / 1000 / 60 / 60


def getKWDuration(duration):
    #      kwhpercount * count / hours = kw
    return kwhpercount * 1 / toHours(duration)

def getKWtimestampOfLastCount(timestampOfLastCount):
    duration = utime.ticks_diff(utime.ticks_ms(), timestampOfLastCount)
    return getKWDuration(duration)

def getKWmeter(meter):
    a = getKWDuration(meter["lastDuration"])
    b = getKWtimestampOfLastCount(meter["timestampOfLastCount"])
    if a > b:
        return b
    elif b >= a:
        return a


def counting(meter):
    countPin = Pin(meter["pin"], Pin.IN, Pin.PULL_DOWN)
    justCounted = False
    while True:
        utime.sleep(0.03)
        if countPin.value() == 1 and not justCounted:
            meter["count"] = meter["count"] + 1
            duration = utime.ticks_diff(utime.ticks_ms(), meter["timestampOfLastCount"])
            meter["lastDuration"] = duration
            meter["timestampOfLastCount"] = utime.ticks_ms()
            justCounted = True
            #print(f"Meter pin {meter["pin"]}: count {meter["count"]}, duration {duration / 1000} s, {meter["kW"]} kW")
            _thread.start_new_thread(blink, ())
        elif countPin.value() == 0 and justCounted:
            #print("duraaaation: " + str(utime.ticks_ms() - lastTime))
            justCounted = False


def printTime(callbackId, currentTime, callbackMemory):
    print(utime.localtime())


def serverListener():
    s = socket.socket()
    s.bind((selfIp, 11500))
    s.listen()
    #s.setblocking(False)
    while True:
        try:
            conn, addr = s.accept()
            conn.settimeout(1)
            conn.recv(1024)
            conn.send("HTTP/1.1 200 OK\n")
            conn.send("Access-Control-Allow-Origin: *\n")
            conn.send("Cache-Control: no-store\n\n")
            data = []
            for meter in meters:
                data.append({"meter": meter["pin"], "kW": getKWmeter(meter)})
            conn.send(json.dumps(data))
            conn.close()
        except Exception as e:
            #print(e)
            continue


def checkConnection():
    if not nic.isconnected():
        connectToInternet()




gc.enable()


#logfile = open("log.txt", "a")
#os.dupterm(logfile)

class logToFile(io.IOBase):
    def __init__(self):
        pass

    def write(self, data):
        with open("logfile.txt", mode="a") as f:
            f.write(data)
        return len(data)

os.dupterm(logToFile())
print("Logging started")


nic = network.WLAN(network.STA_IF)
connectToInternet()
syncTime()
redLED.value(1)  # Off


for meter in meters:
    meter["count"] = 0
    meter["timestampOfLastCount"] = utime.ticks_ms()
    _thread.start_new_thread(counting, (meter,))


# If postRecent called directly, crash happens
def annoyingBug(callbackId, currentTime, callbackMemory):
    _thread.start_new_thread(postRecent, (callbackId, currentTime, callbackMemory))

mcron.init_timer()
mcron.insert(mcron.PERIOD_HOUR, range(0, mcron.PERIOD_HOUR, mcron.PERIOD_HOUR // 4), "every15min", annoyingBug)
# Exceptions are TLPTimeException, see documentation


while True:
    try:
        checkConnection()
        serverListener()
    except Exception as e:
        print(e)
