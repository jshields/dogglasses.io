'use strict';

var Point = function (x, y) {
    this.x = x;
    this.y = y;
    return this;
};
var Transform = function (translationPoint, scale) {
    this.coords = translationPoint;
    //TODO glasses rotation, this.rotation = rotationRadians;
    this.scale = scale;
};
var ImageObject = function (image, transform) {
    this.image = image;
    this.transform = transform;
    this.draw = function (canvasCtx) {
        canvasCtx.drawImage(
            this.image,
            this.transform.coords.x,
            this.transform.coords.y,
            this.transform.scale * this.image.width,
            this.transform.scale * this.image.height
        );
    };
};

var dogAjax = function (imgContent) {

    // https://vision.googleapis.com/$discovery/rest?version=v1
    var computerVisionService = {
        root: 'https://vision.googleapis.com',
        test_url: 'fixtures/dog_response.json',  // FIXME remove test url
        methods: {
            annotate: {
                uri: '/v1/images:annotate',
                requestBodyJSON: function (imgContent) {
                    /*
                    single image request, meant to detect 'dog' label in top 5 label hits
                    see: https://cloud.google.com/vision/docs/reference/rest/v1/images/annotate#Image
                    */
                    return {
                        "requests": [
                            {
                                "image": {
                                    "content": imgContent,  // base64 encoded image
                                },
                                "features": [
                                    {"type": "LABEL_DETECTION", "maxResults": 50}
                                    /*
                                    NOTE: Web Entities search seems to more readily return specific dog breed than label detection does
                                    Web Entities -> Yorkshire Terrier  72.87211
                                    */
                                ]
                            }
                        ]
                    }
                }
            }
        }
    };

    var getDogScore = function (responseObj) {
        for (var i =0; i < responseObj.responses.length; i++) {
            var response = responseObj.responses[i];
            for (var j = 0; j < response.labelAnnotations.length; j++) {
                var label = response.labelAnnotations[j];
                if (label.description.toLowerCase() === 'dog') {
                    // return dog score as percentage w/ 2 decimal places
                    return (label.score * 100).toFixed(2);
                }
            }
        }
        console.warn('Could not find dog label');
        return 0.00;
    };

    var quantizeScoreToClass = function(score) {
        var colorClassForScore = new Map([
            ['alert', 30],
            ['warn', 70],
            ['success', 100]
        ]);
        for (var [key, value] of colorClassForScore.entries()) {
            if (score <= value) {
                return key;
            }
        }
        console.error('score out of range');
    };

    var visionSuccessHandler = function () {
        console.log(this.responseText);
        console.log(this.status);

        if (this.status === 200) {
            dogScore = getDogScore(JSON.parse(this.responseText));
            var statusClass = quantizeScoreToClass(dogScore);
            var dogScoreEl = document.getElementById('dogScore');
            dogScoreEl.innerText = 'Dog Score: ' + dogScore;
            dogScoreEl.className = statusClass;
            document.getElementById('includeDogScore').removeAttribute('disabled');
        } else {
            visionErrorHandler();
        }
    };

    var visionErrorHandler = function () {
        var dogScoreEl = document.getElementById('dogScore');
        dogScoreEl.innerText = 'Error getting Dog Score';
        dogScoreEl.className = quantizeScoreToClass(0);
        console.error('server did not respond with OK');
    };

    // IDEA consider using `fetch` API to cleanup callbacks
    var dogXhr = new XMLHttpRequest();
    dogXhr.addEventListener('load', visionSuccessHandler);
    dogXhr.addEventListener('error', visionErrorHandler);

    var endpoint = computerVisionService.root + computerVisionService.methods.annotate.uri;
    //var endpoint = computerVisionService.test_url;

    var payload = computerVisionService.methods.annotate.requestBodyJSON(imgContent);

    var inconspicuousXhr = new XMLHttpRequest();
    inconspicuousXhr.addEventListener('load', function () {
        var data = JSON.parse(this.responseText);
        var queryParams = '?key=' + data.key;  // at least not in the VCS
        dogXhr.open('POST', endpoint + queryParams);
        dogXhr.send(JSON.stringify(payload));
    });
    inconspicuousXhr.addEventListener('error', function () {
        console.error('error retrieving inconspicuous data');
    });
    inconspicuousXhr.open(
        'GET',
        atob('aHR0cHM6Ly9kbC5kcm9wYm94dXNlcmNvbnRlbnQuY29tL3MvYTJidm5zb3R4dDF0MmMwL2RvZ19hcGlfa2V5Lmpzb24/ZGw9MA==')
    );
    inconspicuousXhr.send();
};

var resolution = new Point(640, 640);

var canvas = document.createElement('canvas');
canvas.innerText = 'Your browser does not support the canvas element.';
canvas.width = resolution.x;
canvas.height = resolution.y;
var ctx = canvas.getContext('2d', {'alpha': false});

var clicked = false;
var mouseX, mouseY;
var imgUrl;

window.addEventListener('load', function (ev) {

    // mouse state variables for canvas
    canvas.addEventListener('mousedown', function (ev) {
        clicked = true;
    });
    canvas.addEventListener('mouseup', function (ev) {
        clicked = false;
    });
    // use drag event instead?
    canvas.addEventListener('mousemove', function (ev) {
        /*
        FIXME
        mouse coords will be incorrect relative to canvas
        unless we draw canvas from top left corner of viewport
        */
        mouseX = ev.pageX;
        mouseY = ev.pageY;
    });
    document.getElementById('dogContainer').appendChild(canvas);

    // dog buttons
    document.getElementById('dogFile').addEventListener('change', function (ev) {
        /*
        BUG? img src attr may be too long for large files when using data URL (?)
        img.src = URL.createObjectURL(file);
        img.onload = function (ev) {
            URL.revokeObjectURL(this.src);
        };
        */
        var file = this.files[0];
        if (file) {
            // read the file, create a data URL for it to be used on canvas
            var reader = new FileReader();
            // set callback for when file is read
            reader.addEventListener('loadend', function (ev) {
                var base64Url = ev.target.result;
                setDog(base64Url);
                // HACK: need to strip out URL part to get just the base 64 string
                dogAjax(base64Url.replace('data:image/jpeg;base64,', ''));
            });
            // start reading file
            reader.readAsDataURL(file);
        }
    });
    document.getElementById('defaultDogBtn').addEventListener('click', function (ev) {
        // currently we don't retrieve any score for default dog
        setDog('img/dog/little_tootie.jpg');
    });

    // glasses buttons
    document.getElementById('glassesFile').addEventListener('change', function (ev) {
        var file = this.files[0];
        if (file) {
            var reader = new FileReader();
            reader.addEventListener('loadend', function (ev) {
                setGlasses(ev.target.result);
            });
            reader.readAsDataURL(file);
        }
    });
    document.getElementById('defaultGlassesBtn').addEventListener('click', function (ev) {
        setGlasses('img/glasses/dealwithit_glasses.png');
    });

    document.getElementById('glassesScale').addEventListener('input', function (ev) {
        glasses.transform.scale = this.value;
    });

    // save image
    document.getElementById('printBtn').addEventListener('click', function (ev) {
        ctx.fillText('Made using dogglasses', 16, 22);

        // Attribute length too long for browser to handle with large dogs, use blob instead.
        // imgUrl = canvas.toDataURL('image/png');

        // before new image is generated, expire old one if present
        var linkContainer = document.getElementById('downloadLinkContainer');
        linkContainer.innerHTML = '';
        if (imgUrl) {
            URL.revokeObjectURL(imgUrl);
        }

        canvas.toBlob(function (blob) {
            imgUrl = URL.createObjectURL(blob);

            var link = document.createElement('a');
            link.setAttribute('href', imgUrl);
            link.setAttribute('download', 'dogglasses.png');

            // Chrome or Firefox might block un-trusted events, leave link in document in case
            link.innerText = 'Click here if download does not begin automatically';

            linkContainer.appendChild(link);
            var clickEvent = new Event('click');
            link.dispatchEvent(clickEvent);
        });
    });
});

var dog, dogScore;
var glasses;

var setDog = function (dogImgPath) {

    var _resizeCanvas = function (canvas, dog) {
        var origDogSize = new Point(dog.width, dog.height);
        canvas.width = document.body.clientWidth;

        // TODO smaller max size is needed for usability
        // max height: window.innerHeight ?

        if (dog.width > canvas.width) {
            // dog larger than canvas
            dog.width = canvas.width;
        } else {
            canvas.width = dog.width;
        }

        var scaleRatio = dog.width / origDogSize.x;
        dog.height *= scaleRatio;
        canvas.height = dog.height;
    };

    var dogImg = new Image();
    dogImg.src = dogImgPath;

    dogImg.addEventListener('load', function (ev) {
        dog = dogImg;
        _resizeCanvas(canvas, dog);
        // enable glasses picker
        document.getElementById('glassesFile').removeAttribute('disabled');
        document.getElementById('defaultGlassesBtn').removeAttribute('disabled');
        // start render loop
        main();
    });
};

var setGlasses = function (glassesImgPath) {
    var glassesImg = new Image();
    glassesImg.src = glassesImgPath;

    glassesImg.addEventListener('load', function (ev) {
        var transform = new Transform(new Point(0, canvas.height/2), 1);
        var glassesObj = new ImageObject(glassesImg, transform);
        glassesObj.fresh = true;

        var glassesScale = document.getElementById('glassesScale');
        glassesScale.removeAttribute('disabled');
        // reset to default value in case this isn't the first pair of glasses since page load
        glassesScale.value = glassesScale.getAttribute('value');
        document.getElementById('printBtn').removeAttribute('disabled');
        glasses = glassesObj;
    });
};


// canvas update / draw cycle
var init = function () {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.font = '22px sans-serif';
    ctx.fillText('Pick a dog to get started', 96, 96);
};
var update = function () {
    if (clicked && glasses) {
        glasses.transform.coords.x = mouseX;
        glasses.transform.coords.y = mouseY;
        glasses.fresh = false;
    }
};
var render = function () {
    ctx.fillStyle = '#000';
    ctx.font = '22px sans-serif';

    if (dog) {
        // draw dog as a background
        ctx.drawImage(dog, 0, 0, dog.width, dog.height);
    }
    if (glasses) {
        glasses.draw(ctx);

        if (glasses.fresh === true) {
            ctx.fillText('Click & drag glasses into place, use slider to scale', 96, 96);
        }
    } else {
        ctx.fillText('Now pick the glasses', 96, 96);
    }
    if (dogScore >= 0 && document.getElementById('includeDogScore').checked) {
        // IDEA: color red, orange, or green based on score
        ctx.fillText('Dog Score: ' + dogScore, 32, canvas.height - 32);
    }
};
var main = function () {
    update();
    render();
    // Call `main` again when the next frame is ready.
    requestAnimationFrame(main);
};
init();
