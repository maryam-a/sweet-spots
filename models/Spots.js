//@author: Isaac Rosado

/**
* Model representing the Spots
* Spots must have a unique title that is between 3 and 20 characters
* Spots must have a creator (User)
* Spots must have a location with latitude and longitude
* Spots may have a floor atrribute. Defaults to 1 if none.
* Spots must be defined by a Tag
* Spots may have Reviews giving a description of the Spot itself
* Spots may have a rating that is the average of all of the ratings of its Reviews
* Spots have a timestamp
* Spots may have reports with information about the user who reported it
*/

var mongoose = require("mongoose");
var reviewsFile = require("../models/Reviews");
var tagsFile = require("../models/Tags");
var Reviews = reviewsFile.Reviews;
var Tags = tagsFile.Tags;
var Users = require("../models/Users").Users;

var tagModel = tagsFile.tagModel;
var reviewModel = reviewsFile.reviewModel;

const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const FORBIDDEN = 403;
const SPOT_NOT_FOUND = "No such spot with that id!";

var spotSchema = mongoose.Schema({
    title: { type: String, unique: true, required: true },
    creator: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
    location: {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true }
    },
    floor: { type: String, default: "1" },
    tag:
    { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Tag" }
    ,
    reviews: [
        { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Review" }
    ],
    rating: { type: Number, required: true },
    timestamp: {
        type: Date,
        default: Date.now
    },
    reports: [
        {
            reporter: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
            reporterScore: Number
        }
    ]
});

var spotModel = mongoose.model("Spot", spotSchema);

var Spots = function(spotModel) {

    var that = Object.create(Spots.prototype);

    const TITLE_LOWER_LIMIT = 3;
    const TITLE_UPPER_LIMIT = 20;
    const FLOOR_UPPER_LIMIT = 3;
    const MILLISECONDS_IN_A_DAY = 86.4 * Math.pow(10, 6);

	/**
	* Checks that the spot follows the rep invariant
	* @param {String} title - the unique name that is between 3 and 20 characters
	* @param {String} floor - an optional argument that specifies which floor the spot is on
	*/
    var checkRep = function(title, floor) {
        var titleLength = title.length;
        var validTitle = (/^[a-zA-z0-9\s\']+$/.test(title) && titleLength >= TITLE_LOWER_LIMIT && titleLength <= TITLE_UPPER_LIMIT);
        var validFloor = true;
        if (floor !== null) {
            validFloor = (/^[A-Z0-9]+$/.test(floor) && floor.length <= FLOOR_UPPER_LIMIT);
        }
        if (!validTitle) {
            return "The title must be a unique name between 3 and 20 characters!";
        }
        if (!validFloor) {
            return "The floor must be alphanumerics and cannot be greater than 3 characters!";
        }
        return null;
    };

    /**
     * Helper function that handles errors
     * @param {Object} err - err.http_status: known errors generated by model
     *                       otherwise, unknown errors
     * @param {function} callback - the callback function
     */
    var errorHandler = function(err, callback) {
        if (err.http_status) {
            callback({ msg: err.msg, http_status: err.http_status });
        } else {
            callback({ msg: err });
        }
    };

	/**
	* Checks to see that the created spot will be valid
	* If the spot is valid, the spot will be added to the database
	* Otherwise, return an error
	* @param {String} title - the unique name that is between 3 and 20 characters
	* @param {ObjectId} creatorId - the id of poster of the Spot
	* @param {Object} location - where the spot is in GPS coordinates
	*							 should be in the form:
	*							 { latitude: the latitude of the spot,
	*							   longitude: the longitude of the spot }
	* @param {String} floor - an optional argument that specifies the floor the spot is on
	* @param {Tag} tag - the tag attached to the spot
	* @param {Review} review - the review that is created with the spot
	* @param {Boolean} createdTag - true if the tag did not exist prior to creating the spot, otherwise false
	* @param {function} callback - the function to be called after checkSpot has executed
	*							   must be called with (err, newSpot) as params
	*/
    var checkSpot = function(title, creatorId, location, floor, tag, review, createdTag, callback) {
        var isInvalid = checkRep(title, floor);
        if (!isInvalid) {
            var spot = new spotModel({
                title: title,
                creator: creatorId,
                location: location,
                tag: tag.id,
                reviews: [review.id],
                rating: review.rating
            });
            if (floor !== null) {
                spot.floor = floor;
            }
            Users.updateRep(creatorId, true, function(err) {
                if (err) {
                    if (err.http_status) {
                        // User cannot be found
                        removeIfInvalid(review.id, tag.id, createdTag, { msg: err.msg, http_status: err.http_status }, callback);
                    } else {
                        // Unknown Error
                        removeIfInvalid(review.id, tag.id, createdTag, { msg: err }, callback);
                    }
                } else {
                    spot.save(function(err, newSpot) {
                        if (err) {
                            // Duplicate title
                            if (err.code === 11000) {
                                removeIfInvalid(review.id, tag.id, createdTag, { msg: "A Spot already exists with this title.", http_status: BAD_REQUEST }, callback);
                            } else {
                                removeIfInvalid(review.id, tag.id, createdTag, { msg: err }, callback);
                            }
                        } else {
                            // Add spot
                            callback(null, newSpot);
                        }
                    });
                }
            });
        } else {
            removeIfInvalid(review.id, tag.id, createdTag, { msg: isInvalid, http_status: BAD_REQUEST }, callback);
        }
    };

	/**
	* Removes the created tag and review if the created spot is invalid
	* @param {ObjectId} reviewId - the id of the review that was created
	* @param {ObjectId} tagId - the id of the tag that was created
	* @param {Boolean} createdTag - true if the tag did not exist prior to creating the spot, otherwise false
	* @param {Object} error - the error message that will be given to the user
	* @param {function} callback - the function to be called after removeIfInvalid has executed
	*							   will be called with (error) as the param
	*/
    var removeIfInvalid = function(reviewId, tagId, createdTag, error, callback) {
        reviewModel.remove({ _id: reviewId }, function(err) {
            if (createdTag) {
                tagModel.remove({ _id: tagId }, function(err) {
                    callback(error);
                });
            } else {
                callback(error);
            }
        });
    };

	/**
	* Adds the spot to the database if the spot does not already exist and if it does not violate the rep invariant
	* Adds one to the creator's rep for creating a new spot
	* Otherwise, return an error.
	* @param {String} title - the unique name that is between 3 and 20 characters
	* @param {ObjectId} creatorId - the id of poster of the Spot
	* @param {Object} location - where the spot is in GPS coordinates
	*							 should be in the form:
	*							 { latitude: the latitude of the spot,
	*							   longitude: the longitude of the spot }
	* @param {String} floor - an optional argument that specifies the floor the spot is on
	* @param {String} label - the name of the tag to be attached to the spot
	* @param {String} description - the written review of the spot
	* @param {Number} rating - the quantitative review of the spot as a number between 1 and 5 inclusive
	* @param {function} callback - the function to be called after addSpot has executed
	*							   must be called with (err, newSpot) as params
	*/
    that.addSpot = function(title, creatorId, location, floor, label, description, rating, callback) {
        var createdTag = false;
        Reviews.addReview(creatorId, description, rating, function(err, review) {
            if (err) {
                errorHandler(err, callback);
            } else {
                Tags.getTagByLabel(label, function(err, tag) {
                    if (err) {
                        if (err.http_status) {
                            //Tag does not exist
                            createdTag = true;
                            Tags.addTag(label, false, function(err, newTag) {
                                if (err) {
                                    if (err.http_status) {
                                        // checkRep is violated
                                        reviewModel.remove({ _id: review.id }, function(error) {
                                            callback({ msg: err.msg, http_status: err.http_status });
                                        });
                                    } else {
                                        // Unknown Error
                                        reviewModel.remove({ _id: review.id }, function(error) {
                                            callback({ msg: err.msg });
                                        });
                                    }
                                } else {
                                    checkSpot(title, creatorId, location, floor, newTag, review, createdTag, callback);
                                }
                            });
                        } else {
                            //Unknown Error
                            reviewModel.remove({ _id: review.id }, function(error) {
                                callback({ msg: err.msg });
                            });
                        }
                    } else {
                        //Tag exists already
                        checkSpot(title, creatorId, location, floor, tag, review, createdTag, callback);
                    }
                });
            }
        });
    };

	/**
	* Adds a review to the specified spot
	* Updates the rating of the Spot
	* Otherwise, return an error.
	* @param {ObjectId} spotId - the spot to have the review added
	* @param {ObjectId} creatorId - the id of the creator of the review
	* @param {String} description - the written review
	* @param {Number} rating - a rating on a 5 scale
	* @param {function} callback - the function to be called after addReview has executed
	*							   must be called with (err, spot, review) as param
	*/
    that.addReviewToSpot = function(spotId, creatorId, description, rating, callback) {
        that.getSpotById(spotId, function(err, spot) {
            if (err) {
                errorHandler(err, callback);
            } else {
                // Spot exists
                var currentReviews = spot.reviews.filter(function(reviewToCheck) {
                    return (JSON.stringify(reviewToCheck.creator._id) === JSON.stringify(creatorId));
                });
                if (currentReviews.length !== 0 || spot.creator === creatorId) {
                    callback({ msg: "You already submitted a review for this spot!", http_status: FORBIDDEN });
                } else {
                    // User can write a Review for the Spot
                    Reviews.addReview(creatorId, description, rating, function(err, review) {
                        if (err) {
                            errorHandler(err, callback);
                        } else {
                            var reviews = spot.reviews;
                            // Add Review to the Spots list of Reviews
                            reviews.push(review);
                            var totalRating = reviews.reduce(function(total, oldReview) {
                                return total += oldReview.rating;
                            });
                            // Calculating the average rating for the Spot
                            spot.rating = totalRating / reviews.length;

                            var reviewsIds = reviews.map(function(populatedReview) {
                                return populatedReview.id;
                            });
                            spot.reviews = reviewsIds;
                            spotModel.update({ _id: spot.id }, { reviews: reviewsIds, rating: spot.rating }, function(err) {
                                if (err) {
                                    callback({ msg: err });
                                } else {
                                    callback(null, spot, review);
                                }
                            });
                        }
                    });
                }
            }
        });
    };

	/**
	* Gets the spot with the given id if it exists
	* Otherwise, return an error.
	* @param {ObjectId} spotId - the id of the spot
	* @param {function} callback - the function to be called after getSpotById has executed
	*							   must be called with (err, spot) as params
	*/
    that.getSpotById = function(spotId, callback) {
        spotModel.findOne({ _id: spotId }, function(err, spot) {
            if (err) {
                callback({ msg: err });
            } else if (spot === null) {
                callback({ msg: SPOT_NOT_FOUND, http_status: NOT_FOUND });
            } else {
                spotModel.populate(spot, { path: "reviews", populate: { path: "creator" } }, function(err, spot) {
                    if (err) {
                        callback({ msg: err });
                    } else {
                        callback(null, spot);
                    }
                });
            }
        });
    };

	/**
	* Gets all the spots created by the given user
	* Otherwise, return an error.
	* @param {UserId} userId - the user whose spots will be given
	* @param {function} callback - the function to be called after getSpotsByUser has executed
	*						       must be called with (err, spots) as params
	*/
    that.getSpotsByUser = function(userId, callback) {
        Users.findUserById(userId, function(err, user) {
            if (err) {
                errorHandler(err, callback);
            } else {
                spotModel.find({ creator: userId }, function(err, spots) {
                    if (err) {
                        callback({ msg: err });
                    } else {
                        callback(null, spots);
                    }
                });
            }
        });
    };

	/**
	* Gets all the spots within the given radius
	* Otherwise, return an error.
	* @param {Number} minLatitude - the minimium latitude of the radius
	* @param {Number} maxLatitude - the maximum latitude of the radius
	* @param {Number} minLongitude - the minimum longitude of the radius
	* @param {Number} maxLongitude - the maximum latitude of the radius
	* @param {function} callback - the function to be called after getSpotsByLocation has executed
	*							   must be called with (err, spots) as params
	*/
    that.getSpotsByLocation = function(minLatitude, maxLatitude, minLongitude, maxLongitude, callback) {
        spotModel.find({ "location.latitude": { $gt: minLatitude, $lt: maxLatitude }, "location.longitude": { $gt: minLongitude, $lt: maxLongitude } })
            .populate("tag")
            .populate({ path: "reviews", populate: { path: "creator" } })
            .exec(function(err, spots) {
                if (err) {
                    callback({ msg: err });
                } else {
                    callback(null, spots);
                }
            });
    };

	/**
	* Gets all the spots that have the given tag
	* Otherwise, return an error.
	* @param {String} label - the name of the tag
	* @param {function} callback - the function to be called after getSpotsByTag has executed
	*							   must be called with (err, spots) as params
	*/
    that.getSpotsByTag = function(label, callback) {
        Tags.getTagByLabel(label, function(err, tagged) {
            if (err) {
                errorHandler(err, callback);
            } else {
                spotModel.find({}).populate("tag").populate({
                    path: "reviews",
                    populate: { path: "creator" }
                }).exec(function(err, spots) {
                    if (err) {
                        callback({ msg: err });
                    } else {
                        var spotsWithTag = spots.filter(function(s) {
                            return s.tag.label === label;
                        });
                        callback(null, spotsWithTag);
                    }
                });
            }
        });
    };

	/**
	 * Given a Review, get the Spot
	 * Otherwise, return an error
	 * @param {ObjectId} reviewId - the id of the review for which the spot is to be retrieved
	 * @param {function} callback - the callback function
	 */
    that.getSpotByReview = function(reviewId, callback) {
        Reviews.getReviewById(reviewId, function(err, review) {
            if (err) {
                errorHandler(err, callback);
            } else {
                spotModel.find({}).populate("creator")
                    .populate("tag")
                    .populate({ path: "reviews", populate: { path: "creator" } })
                    .exec(function(err, spots) {
                        if (err) {
                            callback({ msg: err });
                        } else {
                            var spotGivenReview = spots.filter(function(s) {
                                var spotsWithReview = s.reviews.filter(function(r) {
                                    return JSON.stringify(r._id) === JSON.stringify(reviewId);
                                });
                                return spotsWithReview.length !== 0;
                            });
                            callback(null, spotGivenReview[0]);
                        }
                    });
            }
        });
    };

	/**
	* Gets all the spots
	* Otherwise, return an error.
	* @param {function} callback - the function to be called after getSpots has executed
	*							   must be called with (err, spots) as params
	*/
    that.getSpots = function(callback) {
        spotModel.find({}).populate("tag").populate({
            path: "reviews",
            populate: { path: "creator" }
        }).exec(function(err, spots) {
            if (err) {
                callback({ msg: err });
            } else {
                callback(null, spots);
            }
        });
    };

	/**
	* Allows the user to delete a spot within 24 hours of the spot being created
	* The user can only delete spots that the user has created
	* Otherwise, return an error
	* @param {ObjectId} spotId - the id of the spot to be deleted
	* @param {ObjectId} userId - the id of the user attempting to delete a spot
	* @param {function} callback - the function to be called after deleteSpot has executed
	*							   must be called with (err) as the param
	*/

    that.deleteSpot = function(spotId, userId, callback) {
        that.getSpotById(spotId, function(err, spot) {
            if (err) {
                errorHandler(err, callback);
            } else {
                if (spot === null) {
                    callback({ msg: SPOT_NOT_FOUND, http_status: NOT_FOUND });
                } else {
                    if (JSON.stringify(spot.creator) !== JSON.stringify(userId)) {
                        callback({ msg: "You do not have access to delete this spot!", http_status: FORBIDDEN });
                    } else if (Date.now() - spot.timestamp.createdAt > MILLISECONDS_IN_A_DAY) {
                        callback({ msg: "It has been more than 24 hours since this spot was created!", http_status: FORBIDDEN });
                    } else {
                        spotModel.remove({ _id: spotId }, function(err) {
                            if (err) {
                                callback({ msg: err });
                            } else {
                                callback(null);
                            }
                        });
                    }
                }
            }
        });
    };

	/**
	 * Report a Spot
	 * @param {ObjectId} spotId - the id of the Spot of interest
	 * @param {ObjectId} userId - the id of the User of interest
	 * @param {function} callback - the callback function
	 */
    that.reportSpot = function(spotId, userId, callback) {
        // Check to see if Spot is valid
        that.getSpotById(spotId, function(err, spot) {
            if (err) {
                errorHandler(err, callback);
            } else {
                // Check to see if user is valid
                Users.findUserById(userId, function(err, user) {
                    if (err) {
                        errorHandler(err, callback);
                    } else {
                        var reports = spot.reports ? spot.reports : [];
                        var reporters = reports.map(function(report) {
                            return JSON.stringify(report.reporter);
                        });

                        if (reporters.indexOf(JSON.stringify(userId)) > -1) {
                            // User already reported Spot
                            callback({ msg: "You have already reported this spot!", http_status: FORBIDDEN });
                        } else {
                            // User can report Spot
                            var reportScore = reports.reduce(function(total, report) {
                                return total + report.reporterScore;
                            }, 0);
                            reportScore += user.rep;
                            var numReviews = spot.reviews.length ? spot.reviews.length : 0;
                            if (reportScore > (10 + numReviews)) {
                                // Can be deleted
                                spotModel.remove({ _id: spotId }, function(err) {
                                    if (err) {
                                        errorHandler(err, callback);
                                    } else {
                                        callback(null);
                                    }
                                });
                            } else {
                                // Spot cannot be deleted yet
                                spot.reports.push({ reporter: userId, reporterScore: user.rep });
                                spot.save(function(err, spot) {
                                    if (err) {
                                        callback({ msg: err });
                                    } else {
                                        callback(null);
                                    }
                                });
                            }
                        }
                    }
                });
            }
        });
    };

    Object.freeze(that);
    return that;
};

module.exports = { spotModel: spotModel, Spots: Spots(spotModel) };